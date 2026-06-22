# ─── Stage 1: Build React app ───
FROM node:20-alpine AS builder

WORKDIR /app

# Cache node_modules
COPY package*.json ./
RUN npm install --prefer-offline

# Copy source and build
COPY . .

# Build args for environment variables
ARG VITE_API_URL
ARG VITE_WS_URL
ARG VITE_GOOGLE_MAPS_KEY

ENV VITE_API_URL=$VITE_API_URL
ENV VITE_WS_URL=$VITE_WS_URL
ENV VITE_GOOGLE_MAPS_KEY=$VITE_GOOGLE_MAPS_KEY

RUN npm run build

# ─── Stage 2: Nginx to serve static files ───
FROM nginx:1.25-alpine AS runtime

# Remove default nginx config
RUN rm /etc/nginx/conf.d/default.conf

# Copy custom nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy built React app
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK \
  --interval=30s \
  --timeout=5s \
  CMD wget -qO- http://localhost/health || exit 1

CMD ["nginx", "-g", "daemon off;"]
