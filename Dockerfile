FROM node:26.12.0-alpine@sha256:6f08a523443ddedf52941874c203475b0ad503e859ad70cb26ab8be9a517dbd5 AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginxinc/nginx-unprivileged:1.31.7-alpine3.24@sha256:378d0c32f6562f7fd9629170797f57d2b953aa09be983b3daaf4809bb039ca00
USER 0
RUN apk add --no-cache --upgrade \
    libexpat=2.9.0-r0 \
    libx11=1.8.14-r0 \
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
