-- Stable order for movements and ledger entries recorded at the same instant.
ALTER TABLE "StockMovement" ADD COLUMN "seq" SERIAL NOT NULL;
ALTER TABLE "UtangEntry" ADD COLUMN "seq" SERIAL NOT NULL;
