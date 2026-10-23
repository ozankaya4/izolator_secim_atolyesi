#!/bin/sh
set -eu

if [ "${RENEWED_LINEAGE:-}" = "/etc/letsencrypt/live/ozankaya.net" ]; then
    /usr/sbin/nginx -t
    /bin/systemctl reload nginx
fi
