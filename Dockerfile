FROM node:26.11.1-alpine@sha256:143494b1da2945f061539253adc65e4f1569ddf07da2d384c022c791a9d90a4a AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginxinc/nginx-unprivileged:1.31.6-alpine3.24@sha256:884e0b7f42f303641b0f4e78755aea647521dca0b89ca3be7992ad78b5c07434
USER 0
RUN apk add --no-cache --upgrade \
    libexpat=2.8.5-r0 \
    pcre2=10.49-r0 \
    tiff=4.7.2-r0
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
