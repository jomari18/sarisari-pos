-- Review C1: every foreign key gets an index that starts with its column. Deleting an expired demo store
-- cascades through these keys one row at a time; without them each step scanned the whole table.
CREATE INDEX "Product_categoryId_idx" ON "Product"("categoryId");
CREATE INDEX "Sale_cashierId_idx" ON "Sale"("cashierId");
CREATE INDEX "Sale_customerId_idx" ON "Sale"("customerId");
CREATE INDEX "Sale_voidedById_idx" ON "Sale"("voidedById");
CREATE INDEX "SaleItem_productId_idx" ON "SaleItem"("productId");
CREATE INDEX "StockMovement_productId_idx" ON "StockMovement"("productId");
CREATE INDEX "StockMovement_saleId_idx" ON "StockMovement"("saleId");
CREATE INDEX "StockMovement_userId_idx" ON "StockMovement"("userId");
CREATE INDEX "UtangEntry_customerId_idx" ON "UtangEntry"("customerId");
CREATE INDEX "UtangEntry_saleId_idx" ON "UtangEntry"("saleId");
CREATE INDEX "UtangEntry_userId_idx" ON "UtangEntry"("userId");
