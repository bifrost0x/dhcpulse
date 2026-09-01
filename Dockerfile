FROM node:26.8.1-alpine@sha256:2d984a15c9b54fd0aeb608b8e0d0d83529eb34d2966db27a1fb4f1edc3d298a3 AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginxinc/nginx-unprivileged:1.31.4-alpine3.24@sha256:d9083fe47768377ef55dedafd67d4da7c2f2bc2bece7554954f29359deb0dce9
ARG VERSION=dev
ARG REVISION=unknown
LABEL org.opencontainers.image.title="DHCPulse" \
      org.opencontainers.image.description="Local-first DHCP configuration analysis and guarded change planning" \
      org.opencontainers.image.source="https://github.com/bifrost0x/dhcpulse" \
      org.opencontainers.image.url="https://github.com/bifrost0x/dhcpulse" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.revision="${REVISION}"
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build --chown=101:101 /app/dist /usr/share/nginx/html
USER 101:101
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 CMD ["wget", "-q", "-O", "/dev/null", "http://127.0.0.1:8080/"]
