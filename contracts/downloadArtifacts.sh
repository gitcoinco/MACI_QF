#!/bin/bash

set -e 

cd "$(dirname "$0")"  # Stay in the script's directory

mkdir -p zkeys  # Create the zkeys folder within the project

URL=https://maci-develop-fra.s3.eu-central-1.amazonaws.com/v1.2.0/maci_artifacts_6-9-2-3_prod.tar.gz
DIR_NAME="maci_keys.tar.gz"
OUT_DIR=./zkeys  # Prefix with './' to indicate the current directory

echo "Downloading $URL"
curl $URL -o "$OUT_DIR/$DIR_NAME"

# Extract only the zkeys folder
tar -xvf "$OUT_DIR/$DIR_NAME" -C "$OUT_DIR" zkeys/ 