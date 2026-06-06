"""
PDF parsing for Saraswati.

Uses PyMuPDF (fitz) to extract:
  - Full text from PDF pages
  - Figures/images embedded in the PDF (as base64 PNG)
"""
import base64
import io
import logging
from typing import Optional

logger = logging.getLogger("saraswati.parsing")


def extract_text_from_pdf(pdf_bytes: bytes, max_pages: int = 25) -> str:
    """Extract text from PDF bytes using PyMuPDF."""
    try:
        import fitz
    except ImportError:
        logger.warning("PyMuPDF not installed. Install with: pip install pymupdf")
        return ""

    try:
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        pages_to_read = min(len(doc), max_pages)
        text_parts = []
        for page_num in range(pages_to_read):
            page = doc[page_num]
            text_parts.append(page.get_text("text"))
        doc.close()
        full_text = "\n\n".join(text_parts)
        logger.info(f"Extracted {len(full_text)} chars from {pages_to_read} pages")
        return full_text
    except Exception as e:
        logger.error(f"PDF text extraction failed: {e}")
        return ""


def extract_figures_from_pdf(
    pdf_bytes: bytes,
    max_figures: int = 8,
    min_size: int = 5000,
) -> list[dict]:
    """
    Extract embedded images/figures from PDF.
    Returns list of {"data": base64_png, "page": int, "width": int, "height": int}
    Filters out tiny images (logos, icons, canvas decorations, horizontal dividers)
    using size, dimensions, aspect ratio, page context and color complexity.
    Caps extraction per page to avoid clogging (e.g. from teaser sub-images).
    """
    try:
        import fitz
    except ImportError:
        logger.warning("PyMuPDF not installed")
        return []

    figures = []
    seen_hashes = set()
    extracted_pages = set()
    max_per_page = 2  # Cap per-page figures to avoid teaser component clogging

    try:
        import hashlib
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        for page_num in range(min(len(doc), 20)):
            page = doc[page_num]
            image_list = page.get_images(full=True)
            page_extracted = 0

            for img_index, img in enumerate(image_list):
                if len(figures) >= max_figures:
                    break
                if page_extracted >= max_per_page:
                    break

                xref = img[0]
                try:
                    # Rule 0: Skip images with no placement rects on the page
                    rects = page.get_image_rects(xref)
                    if not rects:
                        logger.info(f"Page {page_num+1}: skipping image {xref} with no page placement rects")
                        continue

                    r = rects[0]
                    pt_width = r.width
                    pt_height = r.height

                    # Rule 0.1: Skip small inline images/icons/sub-components (width < 120 pt or height < 80 pt)
                    if pt_width < 120 or pt_height < 80:
                        logger.info(f"Page {page_num+1}: skipping small inline image {xref} (width={pt_width:.1f}, height={pt_height:.1f} pt)")
                        continue

                    base_image = doc.extract_image(xref)
                    if not base_image:
                        continue

                    image_bytes = base_image["image"]
                    width = base_image.get("width", 0)
                    height = base_image.get("height", 0)
                    
                    # Rule 1: Size in bytes filter
                    if len(image_bytes) < min_size:
                        continue

                    # Rule 2: Minimum dimensions to filter out tiny icons and assets
                    # Real figures must be readable
                    if max(width, height) < 250 or min(width, height) < 120:
                        continue

                    # Rule 3: Aspect Ratio Limit (filters out banner lines, dividers, margins)
                    aspect_ratio = width / height if height > 0 else 0
                    if aspect_ratio < 0.25 or aspect_ratio > 4.0:
                        continue

                    # Rule 4: Strict Page 1 logo/header filter
                    if page_num == 0:
                        # If image is in top 30% of page 1, and not huge, skip it (logo)
                        if r.y1 < page.rect.height * 0.30:
                            if r.width < page.rect.width * 0.7 or r.height < page.rect.height * 0.35:
                                logger.info(f"Skipping page 1 logo/header at rect {r}")
                                continue

                        if len(image_bytes) < 20000 or width < 500 or height < 300:
                            continue

                    # Rule 5: Color Complexity check to filter out solid blocks, dividers, or single colors
                    try:
                        pix = fitz.Pixmap(doc, xref)
                        colors = set()
                        step_x = max(1, pix.width // 20)
                        step_y = max(1, pix.height // 20)
                        for y in range(0, pix.height, step_y):
                            for x in range(0, pix.width, step_x):
                                colors.add(pix.pixel(x, y))
                        color_count = len(colors)
                    except Exception:
                        color_count = -1

                    if color_count != -1 and color_count < 2:
                        continue

                    # Rule 6: MD5 Deduplication
                    img_hash = hashlib.md5(image_bytes).hexdigest()
                    if img_hash in seen_hashes:
                        continue
                    seen_hashes.add(img_hash)

                    # Convert to PNG/JPEG base64 data URI
                    ext = base_image.get("ext", "png")
                    if ext in ("png", "jpeg", "jpg"):
                        b64 = base64.b64encode(image_bytes).decode("utf-8")
                        mime = "image/png" if ext == "png" else "image/jpeg"
                        figures.append({
                            "data": f"data:{mime};base64,{b64}",
                            "page": page_num + 1,
                            "width": width,
                            "height": height,
                        })
                        page_extracted += 1
                        extracted_pages.add(page_num + 1)

                except Exception as e:
                    logger.debug(f"Failed to extract image {img_index} from page {page_num}: {e}")
                    continue

        # Page-by-page fallback for vector figures (pages with captions but no extracted raster images)
        for page_num in range(min(len(doc), 20)):
            if len(figures) >= max_figures:
                break
            
            page_num_1 = page_num + 1
            if page_num_1 in extracted_pages:
                continue

            page = doc[page_num]
            text = page.get_text("text").lower()
            # Find pages containing Figure captions
            if "figure " in text or "fig. " in text:
                try:
                    # Find caption rects
                    caption_rects = []
                    for keyword in ["figure ", "fig. "]:
                        rects = page.search_for(keyword)
                        if rects:
                            caption_rects.extend(rects)

                    # Find drawings bounding box to crop only the figure itself
                    drawings = page.get_drawings()
                    draw_rects = []
                    for d in drawings:
                        r = d["rect"]
                        # Ignore lines that span the entire page width/height (borders, dividers)
                        if r.width > page.rect.width * 0.92 or r.height > page.rect.height * 0.92:
                            continue
                        if r.width < 5 or r.height < 5:
                            continue
                        # Ignore running headers (top 8%) and footers/page-nums (bottom 8%)
                        # On page 1 (page_num == 0), ignore top 30% to skip title / logos
                        top_limit = page.rect.height * 0.30 if page_num == 0 else page.rect.height * 0.08
                        bottom_limit = page.rect.height * 0.92
                        if r.y1 < top_limit or r.y0 > bottom_limit:
                            continue
                        draw_rects.append(r)

                    crop_rect = None
                    if draw_rects and caption_rects:
                        # Union all caption rects to get full caption area
                        cap_union = caption_rects[0]
                        for cr in caption_rects[1:]:
                            cap_union = cap_union | cr
                        
                        # Find drawings vertically near the caption (within 450 pt)
                        near_drawings = []
                        for r in draw_rects:
                            dist = min(abs(r.y1 - cap_union.y0), abs(r.y0 - cap_union.y1))
                            if dist < 450:
                                near_drawings.append(r)
                        
                        target_drawings = near_drawings if near_drawings else draw_rects
                        if target_drawings:
                            bbox = target_drawings[0]
                            for r in target_drawings[1:]:
                                bbox = bbox | r
                            # Union with caption so it is included in crop
                            bbox = bbox | cap_union
                            
                            # Add safety padding
                            padding = 15
                            x0 = max(0, bbox.x0 - padding)
                            y0 = max(0, bbox.y0 - padding)
                            x1 = min(page.rect.width, bbox.x1 + padding)
                            y1 = min(page.rect.height, bbox.y1 + padding)
                            
                            # Ensure width is at least 50% of the page to avoid narrow slivers
                            if (x1 - x0) < page.rect.width * 0.5:
                                center_x = (x0 + x1) / 2
                                half_w = page.rect.width * 0.28
                                x0 = max(0, center_x - half_w)
                                x1 = min(page.rect.width, center_x + half_w)
                                
                            crop_rect = fitz.Rect(x0, y0, x1, y1)

                    if not crop_rect or crop_rect.width < 80 or crop_rect.height < 80:
                        # Smart vertical crop fallback based on caption location (top/bottom half)
                        if caption_rects:
                            cr = caption_rects[0]
                            if cr.y0 > page.rect.height * 0.5:
                                # Caption is in bottom half, figure is likely above it
                                y0 = max(0, cr.y0 - 380)
                                y1 = min(page.rect.height, cr.y1 + 20)
                            else:
                                # Caption is in top half, figure is likely below it
                                y0 = max(0, cr.y0 - 20)
                                y1 = min(page.rect.height, cr.y1 + 380)
                            x0 = max(0, page.rect.width * 0.05)
                            x1 = min(page.rect.width, page.rect.width * 0.95)
                            crop_rect = fitz.Rect(x0, y0, x1, y1)
                        else:
                            crop_rect = page.rect

                    # Render only the cropped figure area as a high-resolution snapshot
                    pix = page.get_pixmap(matrix=fitz.Matrix(1.5, 1.5), clip=crop_rect)
                    png_bytes = pix.tobytes("png")
                    
                    img_hash = hashlib.md5(png_bytes).hexdigest()
                    if img_hash in seen_hashes:
                        continue
                    seen_hashes.add(img_hash)
                    
                    b64 = base64.b64encode(png_bytes).decode("utf-8")
                    figures.append({
                        "data": f"data:image/png;base64,{b64}",
                        "page": page_num_1,
                        "width": pix.width,
                        "height": pix.height,
                    })
                    extracted_pages.add(page_num_1)
                    logger.info(f"Rendered vector figure fallback snapshot for page {page_num_1}")
                except Exception as e:
                    logger.debug(f"Failed to render fallback page {page_num}: {e}")
                    continue

        doc.close()
        logger.info(f"Extracted {len(figures)} unique figures from PDF")
    except Exception as e:
        logger.error(f"PDF figure extraction failed: {e}")

    return figures


def render_first_page_thumbnail(pdf_bytes: bytes, width: int = 200) -> Optional[str]:
    """
    Render the first page of a PDF as a PNG thumbnail.
    Returns base64-encoded PNG data URI, or None on failure.
    """
    try:
        import fitz
    except ImportError:
        return None

    try:
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        if len(doc) == 0:
            doc.close()
            return None

        page = doc[0]
        # Scale to desired width
        zoom = width / page.rect.width
        mat = fitz.Matrix(zoom, zoom)
        pix = page.get_pixmap(matrix=mat)
        png_bytes = pix.tobytes("png")
        doc.close()

        b64 = base64.b64encode(png_bytes).decode("utf-8")
        return f"data:image/png;base64,{b64}"
    except Exception as e:
        logger.error(f"Thumbnail render failed: {e}")
        return None