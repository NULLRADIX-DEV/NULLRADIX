# NULLRADIX als Container-Image: Vite-Build, ausgeliefert von nginx.
# Gebaut von .github/workflows/image.yml, Betrieb: deploy/compose.yml hinter dem nginx des Hosts.

FROM node:26-alpine@sha256:0b36e8c136b94cd4fcf02188228e76c31ad5872eef3fec8cbd2eee500cfd9e80 AS build
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci && npm audit --audit-level=high
COPY . .
RUN npm run build && test -f dist/index.html

# nginx ohne root: läuft als uid 101 auf Port 8080, pid und Temp-Dateien in /tmp.
FROM nginxinc/nginx-unprivileged:stable-alpine@sha256:f5116ed4606f3eb015dd4a8e28cb9b351476dc0ad4bc6e9f93b19cec130cdf03
USER root
# Upgrade the Alpine packages and install nginx 1.30.7 from nginx.org because the base image ships vulnerable versions of both.
# Remove this line as soon as nginx-unprivileged:stable-alpine contains nginx 1.30.7.
RUN apk upgrade --no-cache && apk add --no-cache -X https://nginx.org/packages/alpine/v3.24/main nginx=1.30.7-r1 nginx-module-geoip=1.30.7-r1 nginx-module-image-filter=1.30.7-r1 nginx-module-xslt=1.30.7-r1 nginx-module-njs~1.30.7
USER 101
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /src/dist /usr/share/nginx/html
