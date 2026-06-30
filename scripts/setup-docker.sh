#!/usr/bin/env bash
# CherryPanel — Docker setup helper
#
# Most community server templates (Minecraft Purpur, Unturned, SA-MP, etc.)
# only declare "docker" as a supported environment. Without Docker reachable
# by the pufferpanel daemon, the "Create Server" template list will mark
# these as "Incompatible with environment 'host'" and silently fall back to
# host-only mode.
#
# This script installs Docker (if missing), grants the pufferpanel service
# user access to the Docker socket, and restarts pufferpanel so it picks up
# the new capability immediately.
#
# Usage: sudo bash scripts/setup-docker.sh

set -e

if [ "$(id -u)" -ne 0 ]; then
  echo "Bu script root olarak çalıştırılmalı. Deneyin: sudo bash scripts/setup-docker.sh" >&2
  exit 1
fi

if ! id -u pufferpanel >/dev/null 2>&1; then
  echo "Hata: 'pufferpanel' sistem kullanıcısı bulunamadı. PufferPanel paket kurulumu (deb/rpm) yapılmamış olabilir." >&2
  echo "Bu script yalnızca pufferpanel'in systemd servisi olarak (User=pufferpanel) çalıştığı kurulumlar içindir." >&2
  exit 1
fi

echo "==> Docker durumu kontrol ediliyor..."
if command -v docker >/dev/null 2>&1; then
  echo "    Docker zaten kurulu: $(docker --version)"
else
  if ! command -v apt-get >/dev/null 2>&1; then
    echo "Hata: Bu script şu an yalnızca apt tabanlı sistemleri (Debian/Ubuntu) destekliyor." >&2
    echo "Diğer dağıtımlar için resmi Docker kurulum belgelerini izleyin: https://docs.docker.com/engine/install/" >&2
    exit 1
  fi

  echo "==> Docker bulunamadı, resmi apt deposundan kuruluyor..."
  apt-get update -qq
  apt-get install -qq -y ca-certificates curl gnupg >/dev/null

  install -m 0755 -d /etc/apt/keyrings
  if [ ! -f /etc/apt/keyrings/docker.asc ]; then
    . /etc/os-release
    curl -fsSL "https://download.docker.com/linux/${ID}/gpg" -o /etc/apt/keyrings/docker.asc
    chmod a+r /etc/apt/keyrings/docker.asc
    echo \
      "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/${ID} \
      $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
      > /etc/apt/sources.list.d/docker.list
  fi

  apt-get update -qq
  apt-get install -qq -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin >/dev/null
  echo "    Docker kuruldu: $(docker --version)"
fi

echo "==> Docker servisi etkinleştiriliyor..."
systemctl enable --now docker

echo "==> 'pufferpanel' kullanıcısı 'docker' grubuna ekleniyor..."
usermod -aG docker pufferpanel

echo "==> pufferpanel servisi yeniden başlatılıyor (yeni Docker erişimini tanıması için)..."
systemctl restart pufferpanel

sleep 2

echo "==> Doğrulanıyor..."
if systemctl is-active --quiet docker && systemctl is-active --quiet pufferpanel; then
  echo ""
  echo "✓ Tamamlandı. Docker kuruldu ve pufferpanel ona erişebiliyor."
  echo "  Panelde Nodes → düğümün → 'Docker: true' görmelisin."
  echo "  Create Server adımında artık community şablonları (Docker gerektirenler dahil) seçilebilir olacak."
else
  echo ""
  echo "Uyarı: docker veya pufferpanel servisi aktif görünmüyor, durumlarını kontrol edin:" >&2
  echo "  systemctl status docker pufferpanel" >&2
  exit 1
fi
