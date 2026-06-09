FROM node:20-alpine AS build

WORKDIR /app
COPY editor-fe/package*.json ./
RUN npm ci
COPY editor-fe/ ./
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY editor-fe/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
