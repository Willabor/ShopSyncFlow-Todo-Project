#!/bin/bash

# ShopSyncFlow Backup Script
# Creates a complete backup of database + code for easy rollback

set -e  # Exit on error

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_ROOT="/volume1/docker/backups"
PROJECT_NAME="ShopSyncFlow-Todo-Project"
BACKUP_DIR="$BACKUP_ROOT/${PROJECT_NAME}_${TIMESTAMP}"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔄 ShopSyncFlow Backup Started"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📁 Backup location: $BACKUP_DIR"
echo ""

# Create backup directory
mkdir -p "$BACKUP_DIR"

# 1. Backup Database
echo "📦 Step 1/3: Backing up database..."
docker exec postgres16 pg_dump -U shopsyncflow_user -d shopsyncflow_db --clean --if-exists > "$BACKUP_DIR/database.sql"
DB_SIZE=$(du -h "$BACKUP_DIR/database.sql" | cut -f1)
echo "✅ Database backed up ($DB_SIZE)"
echo ""

# 2. Backup Code
echo "📦 Step 2/3: Backing up application code..."
cp -r /volume1/docker/ShopSyncFlow-Todo-Project "$BACKUP_DIR/code"
# Remove node_modules and build artifacts to save space
rm -rf "$BACKUP_DIR/code/node_modules" "$BACKUP_DIR/code/dist" "$BACKUP_DIR/code/.vite" 2>/dev/null || true
CODE_SIZE=$(du -sh "$BACKUP_DIR/code" | cut -f1)
echo "✅ Code backed up ($CODE_SIZE)"
echo ""

# 3. Create restore script
echo "📦 Step 3/3: Creating restore script..."
cat > "$BACKUP_DIR/RESTORE.sh" << 'EOF'
#!/bin/bash
# ShopSyncFlow Restore Script
# Run this to restore from this backup

set -e

BACKUP_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="/volume1/docker/ShopSyncFlow-Todo-Project"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "⚠️  WARNING: This will restore ShopSyncFlow to this backup"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Backup from: $(basename $BACKUP_DIR)"
echo ""
read -p "Are you sure you want to restore? (yes/no): " confirm

if [ "$confirm" != "yes" ]; then
    echo "❌ Restore cancelled"
    exit 1
fi

echo ""
echo "🔄 Starting restore process..."
echo ""

# 1. Stop containers
echo "📦 Step 1/4: Stopping containers..."
cd "$PROJECT_DIR"
docker-compose down || true
echo "✅ Containers stopped"
echo ""

# 2. Restore database
echo "📦 Step 2/4: Restoring database..."
docker exec -i postgres16 psql -U shopsyncflow_user -d shopsyncflow_db < "$BACKUP_DIR/database.sql"
echo "✅ Database restored"
echo ""

# 3. Restore code
echo "📦 Step 3/4: Restoring application code..."
rm -rf "$PROJECT_DIR"
cp -r "$BACKUP_DIR/code" "$PROJECT_DIR"
cd "$PROJECT_DIR"
echo "✅ Code restored"
echo ""

# 4. Reinstall dependencies and restart
echo "📦 Step 4/4: Reinstalling dependencies and starting containers..."
npm install
docker-compose up -d --build
echo "✅ Containers started"
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Restore Complete!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🌐 Access your application at http://localhost:5000"
echo ""
EOF

chmod +x "$BACKUP_DIR/RESTORE.sh"
echo "✅ Restore script created"
echo ""

# 4. Create metadata file
cat > "$BACKUP_DIR/BACKUP_INFO.txt" << EOF
ShopSyncFlow Backup
===================
Created: $(date)
Timestamp: $TIMESTAMP
Database: shopsyncflow_db
Database Size: $DB_SIZE
Code Size: $CODE_SIZE

To restore this backup:
1. cd $BACKUP_DIR
2. ./RESTORE.sh

Files included:
- database.sql: Complete database dump
- code/: Application source code (without node_modules)
- RESTORE.sh: One-click restore script
EOF

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Backup Complete!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📁 Backup saved to: $BACKUP_DIR"
echo ""
echo "📝 To restore this backup later:"
echo "   cd $BACKUP_DIR"
echo "   ./RESTORE.sh"
echo ""
echo "💾 Disk space used: $(du -sh $BACKUP_DIR | cut -f1)"
echo ""
