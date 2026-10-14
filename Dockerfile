# NULLRADIX als Container-Image: Vite-Build, ausgeliefert von nginx.
# Gebaut von .github/workflows/image.yml, Betrieb: deploy/compose.yml hinter dem nginx des Hosts.

FROM node:26-alpine@sha256:0b36e8c136b94cd4fcf02188228e76c31ad5872eef3fec8cbd2eee500cfd9e80 AS build
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci && npm audit --audit-level=high
COPY . .
RUN npm run build && test -f dist/index.html

# nginx ohne root: läuft als uid 101 auf Port 8080, pid und Temp-Dateien in /tmp.
FROM nginxinc/nginx-unprivileged:stable-alpine@sha256:15c994d10d6d78658721c3bcafff14cb281fba2a4bdf9d5ba92c416a472516e3
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /src/dist /usr/share/nginx/html
