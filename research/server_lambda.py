import os
import sys

# Ensure the project root is in the Python path so research package imports work
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import asyncio

from mangum import Mangum
from research.server import app, run_deep_dive_generation_sync

base_handler = Mangum(app)

# AWS Lambda entrypoint handler
def handler(event, context):
    # Intercept custom background events
    if isinstance(event, dict) and event.get("action") == "generate_deep_dive":
        paper_id = event["paper_id"]
        title = event["title"]
        abstract = event.get("abstract", "")
        authors = event.get("authors", [])
        date = event.get("date", "")
        tags = event.get("tags", [])
        
        loop = asyncio.get_event_loop()
        # Since we're in Lambda execution directly, we can await the background task
        return loop.run_until_complete(
            run_deep_dive_generation_sync(
                paper_id=paper_id,
                title=title,
                abstract=abstract,
                authors=authors,
                date=date,
                tags=tags
            )
        )
        
    return base_handler(event, context)
