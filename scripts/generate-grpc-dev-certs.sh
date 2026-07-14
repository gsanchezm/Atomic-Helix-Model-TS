#!/usr/bin/env bash
set -euo pipefail

output_dir="${1:-certs/grpc}"
valid_days="${TOM_DEV_CERT_DAYS:-30}"
services=(proxy playwright-plugin api-plugin appium-plugin gatling-plugin)

command -v openssl >/dev/null 2>&1 || {
  echo "openssl is required to generate development certificates." >&2
  exit 1
}

mkdir -p "$output_dir"
umask 077

ca_key="$output_dir/ca-key.pem"
ca_cert="$output_dir/ca.pem"

if [[ ! -f "$ca_key" || ! -f "$ca_cert" ]]; then
  openssl req -x509 -newkey rsa:3072 -nodes \
    -keyout "$ca_key" \
    -out "$ca_cert" \
    -days "$valid_days" \
    -sha256 \
    -subj '/CN=TOM Development CA'
fi

for service in "${services[@]}"; do
  key="$output_dir/$service-key.pem"
  csr="$output_dir/$service.csr"
  cert="$output_dir/$service.pem"
  extensions="$output_dir/$service.ext"

  openssl req -new -newkey rsa:2048 -nodes \
    -keyout "$key" \
    -out "$csr" \
    -subj "/CN=$service"
  printf 'subjectAltName=DNS:%s,DNS:localhost,IP:127.0.0.1\nextendedKeyUsage=serverAuth\n' "$service" > "$extensions"
  openssl x509 -req \
    -in "$csr" \
    -CA "$ca_cert" \
    -CAkey "$ca_key" \
    -CAcreateserial \
    -out "$cert" \
    -days "$valid_days" \
    -sha256 \
    -extfile "$extensions"
  rm -f "$csr" "$extensions"
done

chmod 644 "$output_dir"/*.pem
chmod 600 "$output_dir"/*-key.pem
echo "Development gRPC certificates written to $output_dir"
