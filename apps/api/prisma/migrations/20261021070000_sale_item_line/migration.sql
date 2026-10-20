-- Keeps receipt lines in the order they were rung up.
ALTER TABLE "SaleItem" ADD COLUMN "line" INTEGER NOT NULL DEFAULT 0;
