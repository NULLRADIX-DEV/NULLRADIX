# NULLRADIX als Container-Image: Vite-Build, ausgeliefert von nginx.
# Gebaut von .github/workflows/image.yml, Betrieb: deploy/compose.yml hinter dem nginx des Hosts.

FROM node:22-alpine AS build
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && test -f dist/index.html

FROM nginx:stable-alpine
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /src/dist /usr/share/nginx/html
