-- CreateTable
CREATE TABLE "proxy_wallets" (
    "proxyAddress" TEXT NOT NULL,
    "signerAddress" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "proxy_wallets_pkey" PRIMARY KEY ("proxyAddress")
);

-- CreateIndex
CREATE INDEX "proxy_wallets_signerAddress_idx" ON "proxy_wallets"("signerAddress");
