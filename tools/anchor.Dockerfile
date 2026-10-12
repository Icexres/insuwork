# Anchor/Agave toolchain for Windows hosts (OQ-18: Anchor 0.31.1 + Agave 2.1.x).
FROM rust:1.85-bookworm
RUN apt-get update && apt-get install -y --no-install-recommends pkg-config libssl-dev libudev-dev curl && rm -rf /var/lib/apt/lists/*
RUN sh -c "$(curl -sSfL https://release.anza.xyz/v2.1.21/install)"
ENV PATH="/root/.local/share/solana/install/active_release/bin:${PATH}"
RUN cargo install --git https://github.com/coral-xyz/anchor --tag v0.31.1 anchor-cli --locked
WORKDIR /work
