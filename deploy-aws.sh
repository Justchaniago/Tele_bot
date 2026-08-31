#!/bin/bash
set -e

REGION="us-east-1"
REPO_NAME="telebot_engine"
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
ECR_URL="${AWS_ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com"

echo "=== 1. Memulai Docker Daemon (Colima) ==="
if ! docker info >/dev/null 2>&1; then
    echo "Docker tidak berjalan. Mencoba menjalankan Colima..."
    colima start --cpu 2 --memory 4
else
    echo "Docker Daemon sudah aktif."
fi

echo "=== 2. Membuat ECR Repository (jika belum ada) ==="
aws ecr describe-repositories --repository-names ${REPO_NAME} --region ${REGION} >/dev/null 2>&1 || \
aws ecr create-repository --repository-name ${REPO_NAME} --region ${REGION} || \
echo "Peringatan: Gagal membuat/memverifikasi repository. Melanjutkan build (berasumsi repository sudah dibuat secara manual)..."

echo "=== 3. Autentikasi Docker ke AWS ECR ==="
aws ecr get-login-password --region ${REGION} | docker login --username AWS --password-stdin ${ECR_URL}

echo "=== 4. Build Docker Image (platform linux/amd64 untuk ECS) ==="
docker build --platform linux/amd64 -t ${REPO_NAME}:latest .

echo "=== 5. Tag & Push Image ke AWS ECR ==="
docker tag ${REPO_NAME}:latest ${ECR_URL}/${REPO_NAME}:latest
docker push ${ECR_URL}/${REPO_NAME}:latest

echo ""
echo "==========================================================="
echo "✅ DOCKER IMAGE BERHASIL DI-PUSH KE AWS ECR!"
echo "URIs Image: ${ECR_URL}/${REPO_NAME}:latest"
echo "==========================================================="
