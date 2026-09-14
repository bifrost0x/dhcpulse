FROM node:26.8.2-alpine@sha256:ef24c5053d50fdc3e4e56eb4e7ddb7861874ab0fdc797046ba897581deb8e868 AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginxinc/nginx-unprivileged:1.31.5-alpine3.24@sha256:19c132c9ab02d3b783f478743dafc7a7f42e27aa7d2bdcbec1bb1128ca8f2a07
USER 0
RUN apk add --no-cache --upgrade libexpat=2.8.4-r0
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
