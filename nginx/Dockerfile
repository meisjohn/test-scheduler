FROM nginx:alpine

# Install OpenSSL
RUN apk add --no-cache openssl

# Create the certificates directory
RUN mkdir -p /etc/nginx/certs

# Allow overriding the Common Name (CN) via build argument. Defaults to localhost.
ARG HOST_IP=localhost

# Generate a self-signed certificate automatically
# This avoids needing to do it manually on Windows
RUN openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout /etc/nginx/certs/key.pem \
    -out /etc/nginx/certs/cert.pem \
    -subj "/C=US/ST=State/L=City/O=Scheduler/CN=${HOST_IP}"
