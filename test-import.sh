#!/bin/bash

# Test QuickBooks Import with Fixed Color/Size Options
# Product: Premium Disaster Kids Stone Skinny Jeans Slim Fit - Ice Blue
# File: TEST2.xlsx

PRODUCT_ID="55e349ec-3ad4-4650-a1c6-5ed02c9c7e53"
FILE_PATH="/volume1/docker/planning/05-shopsyncflow/Upload/TEST2.xlsx"
API_URL="http://localhost:9000"

echo "🧪 Testing QuickBooks Import with Fixed Color/Size Options"
echo ""

# Step 1: Login
echo "1️⃣ Logging in..."
LOGIN_RESPONSE=$(curl -s -c cookies.txt -X POST "$API_URL/api/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin"}')

if echo "$LOGIN_RESPONSE" | grep -q "Unauthorized"; then
  echo "❌ Login failed"
  exit 1
fi

echo "✅ Logged in successfully"
echo ""

# Step 2: Upload QuickBooks file
echo "2️⃣ Uploading QuickBooks file..."
IMPORT_RESPONSE=$(curl -s -b cookies.txt -X POST \
  "$API_URL/api/products/$PRODUCT_ID/import-variants-from-qb" \
  -F "file=@$FILE_PATH")

echo "$IMPORT_RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$IMPORT_RESPONSE"
echo ""

# Step 3: Verify product options
echo "3️⃣ Verifying product options..."
PRODUCT_RESPONSE=$(curl -s -b cookies.txt "$API_URL/api/products/$PRODUCT_ID")

echo "$PRODUCT_RESPONSE" | python3 -c "
import sys, json
data = json.load(sys.stdin)
print('Product:', data.get('title', 'N/A'))
print('Style Number:', data.get('styleNumber', 'N/A'))
print()
print('Options:')
if 'options' in data and data['options']:
    for opt in data['options']:
        print(f\"  {opt['position']}. {opt['name']}: {opt['values']}\")
else:
    print('  ❌ No options found')
" 2>/dev/null
echo ""

# Step 4: Verify variants
echo "4️⃣ Verifying variants..."
VARIANTS_RESPONSE=$(curl -s -b cookies.txt "$API_URL/api/products/$PRODUCT_ID/variants")

echo "$VARIANTS_RESPONSE" | python3 -c "
import sys, json
data = json.load(sys.stdin)
print(f'Total Variants: {len(data)}')
print()
print('Sample Variants (first 3):')
for i, v in enumerate(data[:3]):
    print(f\"  {i+1}. {v['title']}\")
    print(f\"     SKU: {v['sku']}\")
    print(f\"     option1 (Color): {v['option1']}\")
    print(f\"     option2 (Size): {v['option2']}\")
    print(f\"     Price: \${v['price']}\")
    print()
" 2>/dev/null

# Step 5: Validation
echo "5️⃣ Validation..."
VALIDATION=$(curl -s -b cookies.txt "$API_URL/api/products/$PRODUCT_ID")

echo "$VALIDATION" | python3 -c "
import sys, json
data = json.load(sys.stdin)

# Check options
has_color = any(opt['name'] == 'Color' for opt in data.get('options', []))
has_size = any(opt['name'] == 'Size' for opt in data.get('options', []))

print(f\"✓ Color option created: {'✅ YES' if has_color else '❌ NO'}\")
print(f\"✓ Size option created: {'✅ YES' if has_size else '❌ NO'}\")

# Get variants
" 2>/dev/null

VARIANTS_VALIDATION=$(curl -s -b cookies.txt "$API_URL/api/products/$PRODUCT_ID/variants")

echo "$VARIANTS_VALIDATION" | python3 -c "
import sys, json
variants = json.load(sys.stdin)

all_have_color = all(v['option1'] == 'Ice Blue' for v in variants)
all_have_size = all(v['option2'] is not None for v in variants)

print(f\"✓ All variants have option1 (Color): {'✅ YES' if all_have_color else '❌ NO'}\")
print(f\"✓ All variants have option2 (Size): {'✅ YES' if all_have_size else '❌ NO'}\")
print()

if has_color and has_size and all_have_color and all_have_size:
    print('🎉 SUCCESS! Color/Size relationship properly created!')
else:
    print('❌ VALIDATION FAILED - Structure not correct')
" 2>/dev/null

# Cleanup
rm -f cookies.txt

echo ""
echo "✅ Test complete!"
