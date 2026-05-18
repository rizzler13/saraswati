# Stage 1: Build the React application
FROM node:18-alpine AS builder

WORKDIR /app

# Install dependencies heavily utilizing cache
COPY package.json package-lock.json* ./
RUN npm ci

# Copy the rest of the frontend source code
COPY . .

# Build the app to a static bundle
RUN npm run build

# Stage 2: Serve the application using NGINX
FROM nginx:alpine

# Copy custom Nginx configuration if any, default is usually fine for basic Vite React apps
# COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy build output from Stage 1 to Nginx HTML path
COPY --from=builder /app/dist /usr/share/nginx/html

# Expose port 5173
EXPOSE 5173

# Modify NGINX config to listen on port 5173 instead of default 80
RUN sed -i 's/listen  *80;/listen 5173;/g' /etc/nginx/conf.d/default.conf

CMD ["nginx", "-g", "daemon off;"]
