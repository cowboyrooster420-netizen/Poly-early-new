/**
 * Known CEX (Centralized Exchange) Hot Wallet Addresses on Polygon
 *
 * These addresses are used to detect funding sources for insider detection.
 * A wallet funded directly from a CEX in the last 14 days is a strong signal.
 *
 * Sources:
 * - Polygonscan labeled addresses
 * - Public CEX documentation
 * - On-chain analysis
 *
 * Last updated: 2025-12-20
 */

export interface CexWalletAddress {
  address: string;
  exchange: 'coinbase' | 'binance' | 'kraken' | 'gemini' | 'okx' | 'kucoin' | 'bybit' | 'crypto.com' | 'mexc' | 'coinw' | 'delta' | 'gate' | 'moonpay' | 'revolut' | 'blofin' | 'robinhood';
  label: string;
  verified: boolean;
  notes?: string;
}

/**
 * Coinbase hot wallets on Polygon
 */
const COINBASE_WALLETS: CexWalletAddress[] = [
  {
    address: '0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506',
    exchange: 'coinbase',
    label: 'Coinbase 1',
    verified: true,
  },
  {
    address: '0x46340b20830761efd32832A74d7169B29FEB9758',
    exchange: 'coinbase',
    label: 'Coinbase 2',
    verified: true,
  },
  {
    address: '0x71660c4005BA85c37ccec55d0C4493E66Fe775d3',
    exchange: 'coinbase',
    label: 'Coinbase 3',
    verified: true,
  },
  {
    address: '0x503828976D22510aad0201ac7EC88293211D23Da',
    exchange: 'coinbase',
    label: 'Coinbase 4',
    verified: true,
  },
  {
    address: '0xddfAbCdc4D8FfC6d5beaf154f18B778f892A0740',
    exchange: 'coinbase',
    label: 'Coinbase 5',
    verified: true,
  },
  {
    address: '0x9810762578aCCF1F314320CCa5B72506aE7D7630',
    exchange: 'coinbase',
    label: 'Coinbase 6',
    verified: true,
  },
  {
    address: '0xc9AAA6cA0e05B87d53A3E51Edbc44b406EEaF299',
    exchange: 'coinbase',
    label: 'Coinbase 7',
    verified: true,
  },
  {
    address: '0x4D8336bDa6C11BD2a805C291Ec719BaeDD10AcB9',
    exchange: 'coinbase',
    label: 'Coinbase 8',
    verified: true,
  },
  {
    address: '0xE86F3aaA57F63B2AfeCA68178182a91bC3909962',
    exchange: 'coinbase',
    label: 'Coinbase 9',
    verified: true,
  },
  {
    address: '0x760DcE7eA6e8BA224BFFBEB8a7ff4Dd1Ef122BfF',
    exchange: 'coinbase',
    label: 'Coinbase 10',
    verified: true,
  },
  {
    address: '0x2a410f11A6F520398447bF423DceDd25DFd3a568',
    exchange: 'coinbase',
    label: 'Coinbase 11',
    verified: true,
  },
  {
    address: '0x14AF92363379f3548958f9de1fb2e6E5DF74476e',
    exchange: 'coinbase',
    label: 'Coinbase 12',
    verified: true,
  },
  {
    address: '0xC070A61D043189D99bbf4baA58226bf0991c7b11',
    exchange: 'coinbase',
    label: 'Coinbase 13',
    verified: true,
  },
  {
    address: '0x19aB546E77d0cD3245B2AAD46bd80dc4707d6307',
    exchange: 'coinbase',
    label: 'Coinbase 14',
    verified: true,
  },
  {
    address: '0xCb39C5B0dB9C5b6Bd1D9273dcCC2f98f532A8Bc6',
    exchange: 'coinbase',
    label: 'Coinbase 15',
    verified: true,
  },
  {
    address: '0x6321F9F02D9d56261c8C79131aE74D7b427ccAF5',
    exchange: 'coinbase',
    label: 'Coinbase 16',
    verified: true,
  },
  {
    address: '0xb0fa34C866e1e1E7030820B4f846BB58d6F75b04',
    exchange: 'coinbase',
    label: 'Coinbase 17',
    verified: true,
  },
  {
    address: '0xe3aaC971590635F601Ea751096f11343C70ebaDF',
    exchange: 'coinbase',
    label: 'Coinbase 18',
    verified: true,
  },
  {
    address: '0xE7Ee701BdAA5b446C985BFeCC8933f3E5eeed867',
    exchange: 'coinbase',
    label: 'Coinbase 19',
    verified: true,
  },
  {
    address: '0x3eB9845B9C8f835ad130456f8dab6Aef79aF5272',
    exchange: 'coinbase',
    label: 'Coinbase 20',
    verified: true,
  },
];

/**
 * Binance hot wallets on Polygon
 */
const BINANCE_WALLETS: CexWalletAddress[] = [
  { address: '0x3f5ce5fbfe3e9af3971dd833d26ba9b5c936f0be', exchange: 'binance', label: 'Binance 1', verified: true },
  { address: '0x85b931a32a0725be14285b66f1a22178c672d69b', exchange: 'binance', label: 'Binance 10', verified: true },
  { address: '0xe4b5b2667e049ac8c79ae6c5a7e3300815aa32be', exchange: 'binance', label: 'Binance 100', verified: true },
  { address: '0x00f9451385bf75910d80374eb42edf36d1a3f243', exchange: 'binance', label: 'Binance 101', verified: true },
  { address: '0x4fdfe365436b5273a42f135c6a6244a20404271e', exchange: 'binance', label: 'Binance 102', verified: true },
  { address: '0x18e226459ccf0eec276514a4fd3b226d8961e4d1', exchange: 'binance', label: 'Binance 103', verified: true },
  { address: '0xef268b5c05452d63a17da12f562368e88a036ef1', exchange: 'binance', label: 'Binance 104', verified: true },
  { address: '0xcddc5d0ebeb71a08fff26909aa6c0d4e256b4fe1', exchange: 'binance', label: 'Binance 105', verified: true },
  { address: '0xaba2d404c5c41da5964453a368aff2604ae80a14', exchange: 'binance', label: 'Binance 106', verified: true },
  { address: '0xab72bd3eb3b5cc90165fa39da85ad0d496330c00', exchange: 'binance', label: 'Binance 107', verified: true },
  { address: '0xa64b436964e7415c0e70b9989a53e1fb9a90e726', exchange: 'binance', label: 'Binance 108', verified: true },
  { address: '0x978b21a854dbefcd6d51dfd269875d158046240b', exchange: 'binance', label: 'Binance 109', verified: true },
  { address: '0x708396f17127c42383e3b9014072679b2f60b82f', exchange: 'binance', label: 'Binance 11', verified: true },
  { address: '0x64de13c46f627d9c86212050d48756fb65c06d8a', exchange: 'binance', label: 'Binance 110', verified: true },
  { address: '0x4aec0e98fc1fb55b9cc2faaa7a81acca42cb4e96', exchange: 'binance', label: 'Binance 111', verified: true },
  { address: '0x43839fe6bb18eae45c4228e5d6c8521a9ab57b6e', exchange: 'binance', label: 'Binance 112', verified: true },
  { address: '0x43684d03d81d3a4c70da68febdd61029d426f042', exchange: 'binance', label: 'Binance 113', verified: true },
  { address: '0x3bce63c6c9abf7a47f52c9a3a7950867700b0158', exchange: 'binance', label: 'Binance 114', verified: true },
  { address: '0x308a2a0712570daeea77c8ba9c27a32cdc4000d4', exchange: 'binance', label: 'Binance 115', verified: true },
  { address: '0x1b46970cfe6a271e884f636663c257a5a571fb2c', exchange: 'binance', label: 'Binance 116', verified: true },
  { address: '0x030e37ddd7df1b43db172b23916d523f1599c6cb', exchange: 'binance', label: 'Binance 117', verified: true },
  { address: '0xe0f0cfde7ee664943906f17f7f14342e76a5cec7', exchange: 'binance', label: 'Binance 12', verified: true },
  { address: '0x8f22f2063d253846b53609231ed80fa571bc0c8f', exchange: 'binance', label: 'Binance 13', verified: true },
  { address: '0x28c6c06298d514db089934071355e5743bf21d60', exchange: 'binance', label: 'Binance 14', verified: true },
  { address: '0x21a31ee1afc51d94c2efccaa2092ad1028285549', exchange: 'binance', label: 'Binance 15', verified: true },
  { address: '0xdfd5293d8e347dfe59e90efd55b2956a1343963d', exchange: 'binance', label: 'Binance 16', verified: true },
  { address: '0x56eddb7aa87536c09ccc2793473599fd21a8b17f', exchange: 'binance', label: 'Binance 17', verified: true },
  { address: '0x9696f59e4d72e237be84ffd425dcad154bf96976', exchange: 'binance', label: 'Binance 18', verified: true },
  { address: '0x4d9ff50ef4da947364bb9650892b2554e7be5e2b', exchange: 'binance', label: 'Binance 19', verified: true },
  { address: '0xd551234ae421e3bcba99a0da6d736074f22192ff', exchange: 'binance', label: 'Binance 2', verified: true },
  { address: '0x4976a4a02f38326660d17bf34b431dc6e2eb2327', exchange: 'binance', label: 'Binance 20', verified: true },
  { address: '0xd88b55467f58af508dbfdc597e8ebd2ad2de49b3', exchange: 'binance', label: 'Binance 21', verified: true },
  { address: '0x7dfe9a368b6cf0c0309b763bb8d16da326e8f46e', exchange: 'binance', label: 'Binance 22', verified: true },
  { address: '0x345d8e3a1f62ee6b1d483890976fd66168e390f2', exchange: 'binance', label: 'Binance 23', verified: true },
  { address: '0xc3c8e0a39769e2308869f7461364ca48155d1d9e', exchange: 'binance', label: 'Binance 24', verified: true },
  { address: '0x2e581a5ae722207aa59acd3939771e7c7052dd3d', exchange: 'binance', label: 'Binance 25', verified: true },
  { address: '0x44592b81c05b4c35efb8424eb9d62538b949ebbf', exchange: 'binance', label: 'Binance 26', verified: true },
  { address: '0xa344c7ada83113b3b56941f6e85bf2eb425949f3', exchange: 'binance', label: 'Binance 27', verified: true },
  { address: '0x5a52e96bacdabb82fd05763e25335261b270efcb', exchange: 'binance', label: 'Binance 28', verified: true },
  { address: '0x06a0048079ec6571cd1b537418869cde6191d42d', exchange: 'binance', label: 'Binance 29', verified: true },
  { address: '0x564286362092d8e7936f0549571a803b203aaced', exchange: 'binance', label: 'Binance 3', verified: true },
  { address: '0x892e9e24aea3f27f4c6e9360e312cce93cc98ebe', exchange: 'binance', label: 'Binance 30', verified: true },
  { address: '0x00799bbc833d5b168f0410312d2a8fd9e0e3079c', exchange: 'binance', label: 'Binance 31', verified: true },
  { address: '0x141fef8cd8397a390afe94846c8bd6f4ab981c48', exchange: 'binance', label: 'Binance 32', verified: true },
  { address: '0x50d669f43b484166680ecc3670e4766cdb0945ce', exchange: 'binance', label: 'Binance 33', verified: true },
  { address: '0x2f7e209e0f5f645c7612d7610193fe268f118b28', exchange: 'binance', label: 'Binance 34', verified: true },
  { address: '0xd9d93951896b4ef97d251334ef2a0e39f6f6d7d7', exchange: 'binance', label: 'Binance 35', verified: true },
  { address: '0x19184ab45c40c2920b0e0e31413b9434abd243ed', exchange: 'binance', label: 'Binance 39', verified: true },
  { address: '0x0681d8db095565fe8a346fa0277bffde9c0edbbf', exchange: 'binance', label: 'Binance 4', verified: true },
  { address: '0x294b9b133ca7bc8ed2cdd03ba661a4c6d3a834d9', exchange: 'binance', label: 'Binance 41', verified: true },
  { address: '0x5d7f34372fa8708e09689d400a613eee67f75543', exchange: 'binance', label: 'Binance 42', verified: true },
  { address: '0x515b72ed8a97f42c568d6a143232775018f133c8', exchange: 'binance', label: 'Binance 43', verified: true },
  { address: '0x631fc1ea2270e98fbd9d92658ece0f5a269aa161', exchange: 'binance', label: 'Binance 44', verified: true },
  { address: '0xbd612a3f30dca67bf60a39fd0d35e39b7ab80774', exchange: 'binance', label: 'Binance 45', verified: true },
  { address: '0x161ba15a5f335c9f06bb5bbb0a9ce14076fbb645', exchange: 'binance', label: 'Binance 46', verified: true },
  { address: '0x3c783c21a0383057d128bae431894a5c19f9cf06', exchange: 'binance', label: 'Binance 47', verified: true },
  { address: '0xe7804c37c13166ff0b37f5ae0bb07a3aebb6e245', exchange: 'binance', label: 'Binance 48', verified: true },
  { address: '0x9f8c163cba728e99993abe7495f06c0a3c8ac8b9', exchange: 'binance', label: 'Binance 49', verified: true },
  { address: '0xfe9e8709d3215310075d67e3ed32a380ccf451c8', exchange: 'binance', label: 'Binance 5', verified: true },
  { address: '0xb1256d6b31e4ae87da1d56e5890c66be7f1c038e', exchange: 'binance', label: 'Binance 50', verified: true },
  { address: '0x8894e0a0c962cb723c1976a4421c95949be2d4e3', exchange: 'binance', label: 'Binance 51', verified: true },
  { address: '0x01c952174c24e1210d26961d456a77a39e1f0bb0', exchange: 'binance', label: 'Binance 52', verified: true },
  { address: '0x082489a616ab4d46d1947ee3f912e080815b08da', exchange: 'binance', label: 'Binance 53', verified: true },
  { address: '0xb38e8c17e38363af6ebdcb3dae12e0243582891d', exchange: 'binance', label: 'Binance 54', verified: true },
  { address: '0xacd03d601e5bb1b275bb94076ff46ed9d753435a', exchange: 'binance', label: 'Binance 55', verified: true },
  { address: '0x1b5b4e441f5a22bfd91b7772c780463f66a74b35', exchange: 'binance', label: 'Binance 56', verified: true },
  { address: '0x17b692ae403a8ff3a3b2ed7676cf194310dde9af', exchange: 'binance', label: 'Binance 57', verified: true },
  { address: '0x8ff804cc2143451f454779a40de386f913dcff20', exchange: 'binance', label: 'Binance 58', verified: true },
  { address: '0xad9ffffd4573b642959d3b854027735579555cbc', exchange: 'binance', label: 'Binance 59', verified: true },
  { address: '0x4e9ce36e442e55ecd9025b9a6e0d88485d628a67', exchange: 'binance', label: 'Binance 6', verified: true },
  { address: '0x7a8a34db9acd10c3b6277473b192fe47192569ca', exchange: 'binance', label: 'Binance 60', verified: true },
  { address: '0x1d40b233cdf2cc0cdc347d5401d5b02c2831a0c1', exchange: 'binance', label: 'Binance 61', verified: true },
  { address: '0x4fabb145d64652a948d72533023f6e7a623c7c53', exchange: 'binance', label: 'Binance 62', verified: true },
  { address: '0xf2de20dbf4b224af77aa4ff446f43318800bd6b4', exchange: 'binance', label: 'Binance 63', verified: true },
  { address: '0x7ab33ad1e91ddf6d5edf69a79d5d97a9c49015d4', exchange: 'binance', label: 'Binance 64', verified: true },
  { address: '0x4d072a68d0428a9a3054e03ad7ee61c557b537ab', exchange: 'binance', label: 'Binance 65', verified: true },
  { address: '0x1763f1a93815ee6e6bc3c4475d31cc9570716db2', exchange: 'binance', label: 'Binance 66', verified: true },
  { address: '0x972bed5493f7e7bdc760265fbb4d8e73ea89e453', exchange: 'binance', label: 'Binance 67', verified: true },
  { address: '0x290275e3db66394c52272398959845170e4dcb88', exchange: 'binance', label: 'Binance 68', verified: true },
  { address: '0x505e71695e9bc45943c58adec1650577bca68fd9', exchange: 'binance', label: 'Binance 69', verified: true },
  { address: '0xbe0eb53f46cd790cd13851d5eff43d12404d33e8', exchange: 'binance', label: 'Binance 7', verified: true },
  { address: '0x001ceb373c83ae75b9f5cf78fc2aba3e185d09e2', exchange: 'binance', label: 'Binance 70', verified: true },
  { address: '0x07b664c8af37eddaa7e3b6030ed1f494975e9dfb', exchange: 'binance', label: 'Binance 71', verified: true },
  { address: '0x0e4158c85ff724526233c1aeb4ff6f0c46827fbe', exchange: 'binance', label: 'Binance 72', verified: true },
  { address: '0xb32e9a84ae0b55b8ab715e4ac793a61b277bafa3', exchange: 'binance', label: 'Binance 73', verified: true },
  { address: '0xa7c0d36c4698981fab42a7d8c783674c6fe2592d', exchange: 'binance', label: 'Binance 74', verified: true },
  { address: '0xa84fd90d8640fa63d194601e0b2d1c9094297083', exchange: 'binance', label: 'Binance 75', verified: true },
  { address: '0x3304e22ddaa22bcdc5fca2269b418046ae7b566a', exchange: 'binance', label: 'Binance 76', verified: true },
  { address: '0x923fc76cb13a14e5a87843d309c9f401ec498e2d', exchange: 'binance', label: 'Binance 77', verified: true },
  { address: '0x3cdfb47b0e910d9190ed788726cd72489bf10499', exchange: 'binance', label: 'Binance 78', verified: true },
  { address: '0x417850c1cd0fb428eb63649e9dc4c78ede9a34e8', exchange: 'binance', label: 'Binance 79', verified: true },
  { address: '0xf977814e90da44bfa03b6295a0616a897441acec', exchange: 'binance', label: 'Binance 8', verified: true },
  { address: '0x4a9e49a45a4b2545cb177f79c7381a30e1dc261f', exchange: 'binance', label: 'Binance 80', verified: true },
  { address: '0x4aefa39caeadd662ae31ab0ce7c8c2c9c0a013e8', exchange: 'binance', label: 'Binance 81', verified: true },
  { address: '0x87917d879ba83ce3ada6e02d49a10c1ec1988062', exchange: 'binance', label: 'Binance 82', verified: true },
  { address: '0x7aed074ca56f5050d5a2e512ecc5bf7103937d76', exchange: 'binance', label: 'Binance 83', verified: true },
  { address: '0x835678a611b28684005a5e2233695fb6cbbb0007', exchange: 'binance', label: 'Binance 84', verified: true },
  { address: '0x6d8be5cdf0d7dee1f04e25fd70b001ae3b907824', exchange: 'binance', label: 'Binance 85', verified: true },
  { address: '0x7e278a68a35d76a7e4b2c9d8b778acd775c6d832', exchange: 'binance', label: 'Binance 86', verified: true },
  { address: '0x6be5a267b04e9f24cdc1824fd38d63c436be91ab', exchange: 'binance', label: 'Binance 87', verified: true },
  { address: '0xeb25df7c79a85640c4420680461dcdfd91f0dfad', exchange: 'binance', label: 'Binance 88', verified: true },
  { address: '0x3931dab967c3e2dbb492fe12460a66d0fe4cc857', exchange: 'binance', label: 'Binance 89', verified: true },
  { address: '0x001866ae5b3de6caa5a51543fd9fb64f524f5478', exchange: 'binance', label: 'Binance 9', verified: true },
  { address: '0x25681ab599b4e2ceea31f8b498052c53fc2d74db', exchange: 'binance', label: 'Binance 90', verified: true },
  { address: '0x29fe6c66097f7972d8e47c4f691576327fcf9a12', exchange: 'binance', label: 'Binance 91', verified: true },
  { address: '0xfdd2ba77db02caa6a9869735dac577d809cadd11', exchange: 'binance', label: 'Binance 92', verified: true },
  { address: '0x9bf4001d307dfd62b26a2f1307ee0c0307632d59', exchange: 'binance', label: 'Binance 93', verified: true },
  { address: '0xdee6238780f98c0ca2c2c28453149bea49a3abc9', exchange: 'binance', label: 'Binance 94', verified: true },
  { address: '0x6d9348910e6ed90c1bb170c47965f5f7b8e19763', exchange: 'binance', label: 'Binance 95', verified: true },
  { address: '0xa4e471dbfe8c95d4c44f520b19cee436c01c3267', exchange: 'binance', label: 'Binance 96', verified: true },
  { address: '0xd2c0b70b9b451f7e2688d72460215d84caa6cbe4', exchange: 'binance', label: 'Binance 97', verified: true },
  { address: '0xf6436829cf96ea0f8bc49d300c536fcc4f84c4ed', exchange: 'binance', label: 'Binance 98', verified: true },
  { address: '0xcc71dd74183ea325f537665678263565c0b7e493', exchange: 'binance', label: 'Binance 99', verified: true },
  { address: '0xeb2d2f1b8c558a40207669291fda468e50c8a0bb', exchange: 'binance', label: 'Binance Withdrawals 1', verified: true },
  { address: '0xdccf3b77da55107280bd850ea519df3705d1a75a', exchange: 'binance', label: 'Binance Withdrawals 2', verified: true },
  { address: '0xa180fe01b906a1be37be6c534a3300785b20d947', exchange: 'binance', label: 'Binance Withdrawals 3', verified: true },
  { address: '0x29bdfbf7d27462a2d115748ace2bd71a2646946c', exchange: 'binance', label: 'Binance Withdrawals 4', verified: true },
  { address: '0x1fbe2acee135d991592f167ac371f3dd893a508b', exchange: 'binance', label: 'Binance Withdrawals 5', verified: true },
  { address: '0x73f5ebe90f27b46ea12e5795d16c4b408b19cc6f', exchange: 'binance', label: 'Binance Withdrawals 6', verified: true },
  { address: '0xe2fc31f816a9b94326492132018c3aecc4a93ae1', exchange: 'binance', label: 'Binance Withdrawals 7', verified: true },
];

/**
 * Kraken hot wallets on Polygon
 */
const KRAKEN_WALLETS: CexWalletAddress[] = [
  {
    address: '0x2910543af39aba0cd09dbb2d50200b3e800a63d2',
    exchange: 'kraken',
    label: 'Kraken 1',
    verified: true,
  },
  {
    address: '0x0a869d79a7052c7f1b55a8ebabbea3420f0d1e13',
    exchange: 'kraken',
    label: 'Kraken 2',
    verified: true,
  },
  {
    address: '0x267be1c1d684f78cb4f6a176c4911b741e4ffdc0',
    exchange: 'kraken',
    label: 'Kraken 4',
    verified: true,
  },
  {
    address: '0xfa52274dd61e1643d2205169732f29114bc240b3',
    exchange: 'kraken',
    label: 'Kraken 5',
    verified: true,
  },
  {
    address: '0xc6bed363b30df7f35b601a5547fe56cd31ec63da',
    exchange: 'kraken',
    label: 'Kraken 8',
    verified: true,
  },
  {
    address: '0x29728d0efd284d85187362faa2d4d76c2cfc2612',
    exchange: 'kraken',
    label: 'Kraken 9',
    verified: true,
  },
  {
    address: '0xae2d4617c862309a3d75a0ffb358c7a5009c673f',
    exchange: 'kraken',
    label: 'Kraken 10',
    verified: true,
  },
  {
    address: '0x43984d578803891dfa9706bdeee6078d80cfc79e',
    exchange: 'kraken',
    label: 'Kraken 11',
    verified: true,
  },
  {
    address: '0xda9dfa130df4de4673b89022ee50ff26f6ea73cf',
    exchange: 'kraken',
    label: 'Kraken 13',
    verified: true,
  },
  {
    address: '0x79990a901281bee059bb3f4d7db477f7495e2049',
    exchange: 'kraken',
    label: 'Kraken 15',
    verified: true,
  },
  {
    address: '0x1f7bc4da1a0c2e49d7ef542f74cd46a3fe592cb1',
    exchange: 'kraken',
    label: 'Kraken 16',
    verified: true,
  },
  {
    address: '0x2d070ed1321871841245d8ee5b84bd2712644322',
    exchange: 'kraken',
    label: 'Kraken 17',
    verified: true,
  },
  {
    address: '0x8f9c79b9de8b0713dcac3e535fc5a1a92db6ea2d',
    exchange: 'kraken',
    label: 'Kraken 18',
    verified: true,
  },
  {
    address: '0xb874005cbea25c357b31c62145b3aef219d105cf',
    exchange: 'kraken',
    label: 'Kraken 19',
    verified: true,
  },
  {
    address: '0x555e179d64335945fc6b155b7235a31b0a595542',
    exchange: 'kraken',
    label: 'Kraken 20',
    verified: true,
  },
  {
    address: '0x92927a664c88449318e14d0fd582c787ae2cd934',
    exchange: 'kraken',
    label: 'Kraken 22',
    verified: true,
  },
  {
    address: '0xe84f75fc9caa49876d0ba18d309da4231d44e94d',
    exchange: 'kraken',
    label: 'Kraken 24',
    verified: true,
  },
  {
    address: '0x490b1e689ca23be864e55b46bf038e007b528208',
    exchange: 'kraken',
    label: 'Kraken 25',
    verified: true,
  },
  {
    address: '0x098cae2debcedcedcaf71e43c1c055c0ec369492',
    exchange: 'kraken',
    label: 'Kraken 26',
    verified: true,
  },
  {
    address: '0x9da5812111dcbd65ff9b736874a89751a4f0a2f8',
    exchange: 'kraken',
    label: 'Kraken 27',
    verified: true,
  },
  {
    address: '0xe7178ad747f2c12ab1f8332e61cf6e756815d5c6',
    exchange: 'kraken',
    label: 'Kraken 28',
    verified: true,
  },
  {
    address: '0xadae2f3b0db76cb3eafe76a8bf99b93f099c140a',
    exchange: 'kraken',
    label: 'Kraken 29',
    verified: true,
  },
  {
    address: '0x0e33be39b13c576ff48e14392fbf96b02f40cd34',
    exchange: 'kraken',
    label: 'Kraken 34',
    verified: true,
  },
  {
    address: '0x53ab4a93b31f480d17d3440a6329bda86869458a',
    exchange: 'kraken',
    label: 'Kraken 35',
    verified: true,
  },
  {
    address: '0x10593a64b7b7bb0ea29b8c01f1619ca8ff294b2f',
    exchange: 'kraken',
    label: 'Kraken 36',
    verified: true,
  },
  {
    address: '0x808e5374106e820ae54662fcf8a5e3cca6afa13d',
    exchange: 'kraken',
    label: 'Kraken 37',
    verified: true,
  },
  {
    address: '0xce27fc71139d02f9a3d5cc1356add185750660ac',
    exchange: 'kraken',
    label: 'Kraken 38',
    verified: true,
  },
  {
    address: '0x012480c08d20a14cf3cb495e942a94dd926dcc8f',
    exchange: 'kraken',
    label: 'Kraken 39',
    verified: true,
  },
  {
    address: '0xcdc8488e63a403bfd580222ea0f3719477bfea9c',
    exchange: 'kraken',
    label: 'Kraken 40',
    verified: true,
  },
  {
    address: '0x26a78d5b6d7a7aceedd1e6ee3229b372a624d8b7',
    exchange: 'kraken',
    label: 'Kraken 41',
    verified: true,
  },
  {
    address: '0x8a108e4761386c94b8d2f98a5ffe13e472cfe76a',
    exchange: 'kraken',
    label: 'Kraken 42',
    verified: true,
  },
  {
    address: '0x16b2b042f15564bb8585259f535907f375bdc415',
    exchange: 'kraken',
    label: 'Kraken 43',
    verified: true,
  },
  {
    address: '0x4442c3e6b5f22b8b4dc3c9329be6c850c5779e85',
    exchange: 'kraken',
    label: 'Kraken 44',
    verified: true,
  },
  {
    address: '0xa054611c5b224a5f4ce93ac2a5f8d0ed17813402',
    exchange: 'kraken',
    label: 'Kraken 45',
    verified: true,
  },
  {
    address: '0xa25aa6dfbf6d9bbd7a6a9eb47b9f1e57a2bd92d7',
    exchange: 'kraken',
    label: 'Kraken 46',
    verified: true,
  },
  {
    address: '0xcd0267c7f1a8ad1b6e33b7fb801f8d935f6b557d',
    exchange: 'kraken',
    label: 'Kraken 47',
    verified: true,
  },
  {
    address: '0xd0ad6ed2b2920a5744a064af3d585ee54f528b2f',
    exchange: 'kraken',
    label: 'Kraken 48',
    verified: true,
  },
  {
    address: '0xa861678bee80035114b47615142e9302139a8c32',
    exchange: 'kraken',
    label: 'Kraken 49',
    verified: true,
  },
  {
    address: '0xd88545d0034c245857d1523bb4e8686bced9bb85',
    exchange: 'kraken',
    label: 'Kraken 50',
    verified: true,
  },
  {
    address: '0x16b34756653f88a89005e96c0622832d8fb6b0b5',
    exchange: 'kraken',
    label: 'Kraken 51',
    verified: true,
  },
  {
    address: '0x23d4df4631aa3ca30653d3c29c0eeef607b1d9fd',
    exchange: 'kraken',
    label: 'Kraken 80',
    verified: true,
  },
  {
    address: '0xa939bffb33bed18dc0063737cb9ea41a1fdb2fe3',
    exchange: 'kraken',
    label: 'Kraken 81',
    verified: true,
  },
  {
    address: '0x7c628430e0702847cf4ec7211c80314e46db4c87',
    exchange: 'kraken',
    label: 'Kraken 82',
    verified: true,
  },
  {
    address: '0x30e84f627ebc336eee72cd720a837e6f75d865d5',
    exchange: 'kraken',
    label: 'Kraken 83',
    verified: true,
  },
  {
    address: '0x0a332d03367366dd5fd3a554ef8f8b47ed36e591',
    exchange: 'kraken',
    label: 'Kraken 84',
    verified: true,
  },
  {
    address: '0x99fa9468170a622c8abfde7b19bb84b64a203fbd',
    exchange: 'kraken',
    label: 'Kraken 85',
    verified: true,
  },
  {
    address: '0x24c65132cded9e5b356a62d4cea59a8b3f0bd7f4',
    exchange: 'kraken',
    label: 'Kraken 86',
    verified: true,
  },
  {
    address: '0x5360c1e24d2367ddbe9e2c6af0f93535e824ada8',
    exchange: 'kraken',
    label: 'Kraken 87',
    verified: true,
  },
  {
    address: '0xdcfbeeebab1c418891b5ace6a022efa3d4a659fa',
    exchange: 'kraken',
    label: 'Kraken 88',
    verified: true,
  },
  {
    address: '0xb61bb0c3f4afc30b1d8dbcb8767c0e38c4829322',
    exchange: 'kraken',
    label: 'Kraken 89',
    verified: true,
  },
  {
    address: '0xf050257f16a466f7d3926a38e830589ab539ee88',
    exchange: 'kraken',
    label: 'Kraken 90',
    verified: true,
  },
  {
    address: '0x07fdda8fc50f7df742b850a51e5871135f45b557',
    exchange: 'kraken',
    label: 'Kraken 91',
    verified: true,
  },
  {
    address: '0x34e8ed33d8c1953b33de603b014079c578e01716',
    exchange: 'kraken',
    label: 'Kraken 92',
    verified: true,
  },
  {
    address: '0x205188a68430e94f80a512038329030c556b50ff',
    exchange: 'kraken',
    label: 'Kraken 93',
    verified: true,
  },
  {
    address: '0x0eefaf34f9ccf41366ab547330c8978be8fd3ff9',
    exchange: 'kraken',
    label: 'Kraken 94',
    verified: true,
  },
  {
    address: '0xaf66df4c01643839d224a6ce8845d109f9e237ab',
    exchange: 'kraken',
    label: 'Kraken 95',
    verified: true,
  },
  {
    address: '0x181020fb8481217fa5c843f0c4e62a4ea236c4d9',
    exchange: 'kraken',
    label: 'Kraken 96',
    verified: true,
  },
  {
    address: '0x47445762435054e4b67dfd5a3fc3956a97958af4',
    exchange: 'kraken',
    label: 'Kraken 97',
    verified: true,
  },
  {
    address: '0x6c4e92471e8a8d8068894570502000e41fdbbd08',
    exchange: 'kraken',
    label: 'Kraken 98',
    verified: true,
  },
  {
    address: '0x5eda7655e58bdcf149c1545b8fc710b796d79cf7',
    exchange: 'kraken',
    label: 'Kraken 99',
    verified: true,
  },
  {
    address: '0x735b1c7fde46d12e16952f650ba05211d37b0e17',
    exchange: 'kraken',
    label: 'Kraken 100',
    verified: true,
  },
  {
    address: '0x14af4dc16c65fd0c43937d7c6fc8f443da29d0bb',
    exchange: 'kraken',
    label: 'Kraken 101',
    verified: true,
  },
  {
    address: '0xaddb27092681351a19ceb737214cad46a30176e3',
    exchange: 'kraken',
    label: 'Kraken 102',
    verified: true,
  },
  {
    address: '0xb05b5d96e61df493548e85ec8f2d46482dcb16a3',
    exchange: 'kraken',
    label: 'Kraken 103',
    verified: true,
  },
  {
    address: '0x26c1df84f7917c5d90f1d8d744b0caaf1ae3fa11',
    exchange: 'kraken',
    label: 'Kraken 104',
    verified: true,
  },
  {
    address: '0x86631784b0d170c6562f34ca3c7d84388b246d54',
    exchange: 'kraken',
    label: 'Kraken 105',
    verified: true,
  },
  {
    address: '0xe80e404cfc2ce9ffc0a30b368b0f963dfc708eb5',
    exchange: 'kraken',
    label: 'Kraken 106',
    verified: true,
  },
  {
    address: '0x1413142d4ae07a81c80aee665a08e53cb32c2d54',
    exchange: 'kraken',
    label: 'Kraken 107',
    verified: true,
  },
  {
    address: '0xec6a3cec61159701a017174d2c0236706f91c94f',
    exchange: 'kraken',
    label: 'Kraken 108',
    verified: true,
  },
  {
    address: '0xa215c2d7e0d6e3479ca730d318e1dfd22fea357b',
    exchange: 'kraken',
    label: 'Kraken 109',
    verified: true,
  },
  {
    address: '0x7a2e4aa4f2f6ab66594fff84dcabac67fb9773c8',
    exchange: 'kraken',
    label: 'Kraken 110',
    verified: true,
  },
  {
    address: '0x479011b0cb148fd7cd0c3cca0c32f9c6777e577a',
    exchange: 'kraken',
    label: 'Kraken 111',
    verified: true,
  },
  {
    address: '0x1d0065d367da1919cd597d25f91a97b6039428c5',
    exchange: 'kraken',
    label: 'Kraken 112',
    verified: true,
  },
  {
    address: '0x501d09d60a7431fa524f80b55ef7572e037fac2c',
    exchange: 'kraken',
    label: 'Kraken 113',
    verified: true,
  },
  {
    address: '0x3d447db5366c5ec22079597ff9dec7bf4429a3e4',
    exchange: 'kraken',
    label: 'Kraken 114',
    verified: true,
  },
  {
    address: '0x6a68d4acff1a1dacc80e4ae653543e0d2402803e',
    exchange: 'kraken',
    label: 'Kraken 115',
    verified: true,
  },
  {
    address: '0x675938d86a6a4651b6dbba7529117fb0b557ccf2',
    exchange: 'kraken',
    label: 'Kraken 116',
    verified: true,
  },
  {
    address: '0xc0fce7361f72227972562b3c87812e1dea1c9cac',
    exchange: 'kraken',
    label: 'Kraken 121',
    verified: true,
  },
  {
    address: '0xf510dde022a655e7e3189cdf67687e7ffcd80d91',
    exchange: 'kraken',
    label: 'Kraken 122',
    verified: true,
  },
  {
    address: '0xe2d6ae60244376c311cd4f54a8455ed18977134a',
    exchange: 'kraken',
    label: 'Kraken 123',
    verified: true,
  },
  {
    address: '0xdbad7f38cac7ff6521d3acf242349dfbb5fa965d',
    exchange: 'kraken',
    label: 'Kraken 124',
    verified: true,
  },
  {
    address: '0x60637c83bd6aea40d637d91cca8d724272b2d5fa',
    exchange: 'kraken',
    label: 'Kraken 125',
    verified: true,
  },
  {
    address: '0xdfb321988b6a7e0c7f427d3b237591212d8b1005',
    exchange: 'kraken',
    label: 'Kraken 126',
    verified: true,
  },
  {
    address: '0xf103ddb6005736f3bb0d959f1419656792f9807d',
    exchange: 'kraken',
    label: 'Kraken 127',
    verified: true,
  },
  {
    address: '0xf47b5defcd9642accf321f38c4ed319e4efeb47c',
    exchange: 'kraken',
    label: 'Kraken 128',
    verified: true,
  },
  {
    address: '0xa0dfe02e17b6f82c10bc04fdfc0dec8e8e53b309',
    exchange: 'kraken',
    label: 'Kraken 129',
    verified: true,
  },
  {
    address: '0x68ee447f886fa729f2e8723296572a93932affca',
    exchange: 'kraken',
    label: 'Kraken 130',
    verified: true,
  },
  {
    address: '0x3dce541d185e6893e53b2f817cf435cc28291713',
    exchange: 'kraken',
    label: 'Kraken 131',
    verified: true,
  },
  {
    address: '0x8e82c551f4f1bbc8802800d5ed8de03c0be845de',
    exchange: 'kraken',
    label: 'Kraken 132',
    verified: true,
  },
  {
    address: '0xb930776e755d470b023df39006e8eb13336f47b8',
    exchange: 'kraken',
    label: 'Kraken 133',
    verified: true,
  },
  {
    address: '0x108a745ce1faea55ebc09aa217b554a7a7e865b2',
    exchange: 'kraken',
    label: 'Kraken 134',
    verified: true,
  },
  {
    address: '0x618a9141045db7b2e28b3edda56bfbeee0e65ec1',
    exchange: 'kraken',
    label: 'Kraken 135',
    verified: true,
  },
  {
    address: '0xfa820671257a3bf42379c7c4deeaf2f05500a3e4',
    exchange: 'kraken',
    label: 'Kraken 136',
    verified: true,
  },
  {
    address: '0x01b8629d722d451ba9dd0a539c2ba11b6dbe68b8',
    exchange: 'kraken',
    label: 'Kraken 137',
    verified: true,
  },
  {
    address: '0x52cf9132b4847591881c09fcdc79c0e90f4c753d',
    exchange: 'kraken',
    label: 'Kraken 138',
    verified: true,
  },
  {
    address: '0x317128b5cd8ea4e0fb8665b36aa399ea18b7118b',
    exchange: 'kraken',
    label: 'Kraken 139',
    verified: true,
  },
  {
    address: '0x6675038e71627be276d6347ec330c0c5fdcace61',
    exchange: 'kraken',
    label: 'Kraken 144',
    verified: true,
  },
  {
    address: '0x69fd3ef67adcb9fd76396e2e4330629c9a8df59f',
    exchange: 'kraken',
    label: 'Kraken 145',
    verified: true,
  },
  {
    address: '0xfedac45de308e24b8282193c512f029250943d8a',
    exchange: 'kraken',
    label: 'Kraken 146',
    verified: true,
  },
  {
    address: '0x72beaf2b92a96aa4b7b12698e31c7e5dd062c3e4',
    exchange: 'kraken',
    label: 'Kraken 147',
    verified: true,
  },
  {
    address: '0x0d0452f487d1edc869d1488ae984590ca2900d2f',
    exchange: 'kraken',
    label: 'Kraken 148',
    verified: true,
  },
  {
    address: '0x00d3c53b1ec47932c25595ba2e53e9db20fc7364',
    exchange: 'kraken',
    label: 'Kraken 149',
    verified: true,
  },
  {
    address: '0x9b2c49f34aa754f299f3ff0161041ebf31140f4c',
    exchange: 'kraken',
    label: 'Kraken 150',
    verified: true,
  },
  {
    address: '0xd120b8321826cc942fab7c57417545f2333ed6b7',
    exchange: 'kraken',
    label: 'Kraken 151',
    verified: true,
  },
  {
    address: '0x584ce70ecfeceea309675726875e8e0fdbc08b20',
    exchange: 'kraken',
    label: 'Kraken 152',
    verified: true,
  },
  {
    address: '0xc538f3351e0b8d3ed53402ea8f316898c160ca29',
    exchange: 'kraken',
    label: 'Kraken 153',
    verified: true,
  },
  {
    address: '0x90e8f9cd751f66029a203f865c01baec1ca86c73',
    exchange: 'kraken',
    label: 'Kraken 154',
    verified: true,
  },
  {
    address: '0xae4a9e227d5093995594fa0bd99e250686ac5ddc',
    exchange: 'kraken',
    label: 'Kraken 155',
    verified: true,
  },
  {
    address: '0x1d0e8445694a22f34334ad1ade6271ecde76db63',
    exchange: 'kraken',
    label: 'Kraken 156',
    verified: true,
  },
  {
    address: '0x17c358503e8f0a0322b304ffc0390b08a0de0fa3',
    exchange: 'kraken',
    label: 'Kraken 157',
    verified: true,
  },
  {
    address: '0x6eebda76e452f2f95867d56b70f1224148bf6bfc',
    exchange: 'kraken',
    label: 'Kraken 158',
    verified: true,
  },
  {
    address: '0x72812e21f33de611e674ec18d60554ac895b1eee',
    exchange: 'kraken',
    label: 'Kraken 159',
    verified: true,
  },
  {
    address: '0x3f04aad87cf879410a0f27c53c9d9049214a6ad6',
    exchange: 'kraken',
    label: 'Kraken 160',
    verified: true,
  },
  {
    address: '0xd23629a6622bbd1f2a3e7d65c715d79e68273876',
    exchange: 'kraken',
    label: 'Kraken 161',
    verified: true,
  },
  {
    address: '0x7322367325b4769400a1eafb1e2b41d6e966153a',
    exchange: 'kraken',
    label: 'Kraken 167',
    verified: true,
  },
  {
    address: '0x12fd1ac6c2237776ab04bdcb3dbadf6dfbf7f1b6',
    exchange: 'kraken',
    label: 'Kraken 168',
    verified: true,
  },
  {
    address: '0x1a6fc5abd6d15fa3673784da167db7f80b90e472',
    exchange: 'kraken',
    label: 'Kraken 169',
    verified: true,
  },
  {
    address: '0x8b973a304138eca1936d77ac07980840c5775258',
    exchange: 'kraken',
    label: 'Kraken 170',
    verified: true,
  },
  {
    address: '0xac972a4c5d82e8c42fa13ee338708c9a3f5d5a93',
    exchange: 'kraken',
    label: 'Kraken 171',
    verified: true,
  },
  {
    address: '0x6c92e0e6a9984c0f44677f678e8fc10bebe3de64',
    exchange: 'kraken',
    label: 'Kraken 172',
    verified: true,
  },
  {
    address: '0xfd387b7ddea5880beeee5664d547cd2da614df8d',
    exchange: 'kraken',
    label: 'Kraken 173',
    verified: true,
  },
  {
    address: '0x210b3cb99fa1de0a64085fa80e18c22fe4722a1b',
    exchange: 'kraken',
    label: 'Kraken 174',
    verified: true,
  },
  {
    address: '0xc06f25517e906b7f9b4dec3c7889503bb00b3370',
    exchange: 'kraken',
    label: 'Kraken 175',
    verified: true,
  },
  {
    address: '0x1ed8b3e4278184675fefa6981dea36f4535df417',
    exchange: 'kraken',
    label: 'Kraken 176',
    verified: true,
  },
  {
    address: '0xb23c002bc65c6bb539aad4c11d606ef4f5502c93',
    exchange: 'kraken',
    label: 'Kraken 177',
    verified: true,
  },
  {
    address: '0xed9b8f05224b881a222ece2e20bd2f4bdb71d0f8',
    exchange: 'kraken',
    label: 'Kraken 178',
    verified: true,
  },
  {
    address: '0x94dbf04e273d87e6d9bed68c616f43bf86560c74',
    exchange: 'kraken',
    label: 'Kraken 179',
    verified: true,
  },
  {
    address: '0x39ed68f2087dca23f76792eca8f39508e74d82e5',
    exchange: 'kraken',
    label: 'Kraken 180',
    verified: true,
  },
  {
    address: '0xb604f2d512eaa32e06f1ac40362bc9157ce5da96',
    exchange: 'kraken',
    label: 'Kraken 181',
    verified: true,
  },
  {
    address: '0x91a5fd6db2332e574e5aae850613267dfd37f464',
    exchange: 'kraken',
    label: 'Kraken 182',
    verified: true,
  },
  {
    address: '0xf4dd9bc7ae7ae04502ec85fb9f4ee0463e905b20',
    exchange: 'kraken',
    label: 'Kraken 183',
    verified: true,
  },
  {
    address: '0xa6e5f4b57869b4a12e83e98bbcbccf0480c20861',
    exchange: 'kraken',
    label: 'Kraken 184',
    verified: true,
  },
  {
    address: '0xe63fd0717aac814a3f7f5ed90bfa18c0abaf0d85',
    exchange: 'kraken',
    label: 'Kraken 190',
    verified: true,
  },
  {
    address: '0x867d7a219a93dd7cb7b08e1438efc1da0a49ec69',
    exchange: 'kraken',
    label: 'Kraken 191',
    verified: true,
  },
  {
    address: '0x2d582746709928a6f66f5be9bec195c5b49bc7c1',
    exchange: 'kraken',
    label: 'Kraken 192',
    verified: true,
  },
  {
    address: '0x3bef9fb8df3d641f5f8578a8b84ef9f6d94a59b6',
    exchange: 'kraken',
    label: 'Kraken 193',
    verified: true,
  },
  {
    address: '0x2b8efcb849316b060a1c86498470f967d3184a2c',
    exchange: 'kraken',
    label: 'Kraken 194',
    verified: true,
  },
  {
    address: '0x3b3d891d9e4e150330b527306c70e3efa5620539',
    exchange: 'kraken',
    label: 'Kraken 195',
    verified: true,
  },
  {
    address: '0x6beb80178a63aee95620f4d30f2e992385ad2207',
    exchange: 'kraken',
    label: 'Kraken 196',
    verified: true,
  },
  {
    address: '0x7982a7efbff0cc2da4092d401aa72c6a0a030231',
    exchange: 'kraken',
    label: 'Kraken 197',
    verified: true,
  },
  {
    address: '0x9ee32359b180ff684a315053e418aaf223932cb9',
    exchange: 'kraken',
    label: 'Kraken 198',
    verified: true,
  },
  {
    address: '0x2c04af9362797bdc4b182e29e0c58440411a4481',
    exchange: 'kraken',
    label: 'Kraken 199',
    verified: true,
  },
  {
    address: '0x3c246f5f8f705318250c0bc32724a7f75bde54b1',
    exchange: 'kraken',
    label: 'Kraken 200',
    verified: true,
  },
  {
    address: '0x6c8a8cadfe0539ebc1532600c415e775c78bf625',
    exchange: 'kraken',
    label: 'Kraken 201',
    verified: true,
  },
  {
    address: '0x2989be98cd0d84d492e4b2410301b4b4be4f7a70',
    exchange: 'kraken',
    label: 'Kraken 202',
    verified: true,
  },
  {
    address: '0x21ba9d82ac862daace296bc6467efce8e3190f1c',
    exchange: 'kraken',
    label: 'Kraken 203',
    verified: true,
  },
  {
    address: '0xeb46d8c1519ae6c18bac20749c93ee7d5a7ada89',
    exchange: 'kraken',
    label: 'Kraken 204',
    verified: true,
  },
  {
    address: '0x431e1fc408d16235fce906a6ecac353fcc88565d',
    exchange: 'kraken',
    label: 'Kraken 205',
    verified: true,
  },
  {
    address: '0x9eb99d39998a590d3631f6eabd1c1a1c43eb5f2b',
    exchange: 'kraken',
    label: 'Kraken 206',
    verified: true,
  },
  {
    address: '0x1e4bf013652c59ae6acda550bf49074268b7efa2',
    exchange: 'kraken',
    label: 'Kraken 211',
    verified: true,
  },
  {
    address: '0xe05ad2490a469c7cad9b517bb4245733ef497c7f',
    exchange: 'kraken',
    label: 'Kraken 212',
    verified: true,
  },
  {
    address: '0xfbfc7a458017c1566ecf87cb746c7ca915a79f7f',
    exchange: 'kraken',
    label: 'Kraken 213',
    verified: true,
  },
  {
    address: '0xec7e38643787f4e971226ce7dad720d12b803b00',
    exchange: 'kraken',
    label: 'Kraken 214',
    verified: true,
  },
  {
    address: '0xe6c434cfa5c0d42a4cd7da31cf6d4d232c46b651',
    exchange: 'kraken',
    label: 'Kraken 215',
    verified: true,
  },
  {
    address: '0x71beefcf9f31872ccec0bc9789f211609685205a',
    exchange: 'kraken',
    label: 'Kraken 216',
    verified: true,
  },
  {
    address: '0x17a749f7fa0055618aa5f958d5aa13f5f5d19ea1',
    exchange: 'kraken',
    label: 'Kraken 217',
    verified: true,
  },
  {
    address: '0x2995eb883fd4b4111116f1fdedbbc47a122a5c75',
    exchange: 'kraken',
    label: 'Kraken 218',
    verified: true,
  },
  {
    address: '0x310e035d176ccb589511ed16af7ae7bac4fc7f83',
    exchange: 'kraken',
    label: 'Kraken 219',
    verified: true,
  },
  {
    address: '0x229eee9e5b241e52e4d13aae128fe44b5873f740',
    exchange: 'kraken',
    label: 'Kraken 220',
    verified: true,
  },
  {
    address: '0x8b8cd3560e9e7ad464740cbfe031bf941747b76e',
    exchange: 'kraken',
    label: 'Kraken 221',
    verified: true,
  },
  {
    address: '0x133fa49a01801264fc05a12ef5ef9db6a302e93d',
    exchange: 'kraken',
    label: 'Kraken 222',
    verified: true,
  },
  {
    address: '0x50afe53eb8123d33061ae5b16c1ad2ce995f82a0',
    exchange: 'kraken',
    label: 'Kraken 223',
    verified: true,
  },
  {
    address: '0x34036f30371847c9fd8036b7ea5af1b3126306dc',
    exchange: 'kraken',
    label: 'Kraken 224',
    verified: true,
  },
  {
    address: '0x45783790b282e8df4900d43febad284f3958d453',
    exchange: 'kraken',
    label: 'Kraken 225',
    verified: true,
  },
  {
    address: '0x5e4b4fd3ae1507febe0ac1c77f43641a71efba56',
    exchange: 'kraken',
    label: 'Kraken 226',
    verified: true,
  },
  {
    address: '0xf72d20ff0972a36b01412cddda0bb1ba1a9d3d93',
    exchange: 'kraken',
    label: 'Kraken 227',
    verified: true,
  },
  {
    address: '0xc494468cd4826380365aebbfbb1d6bf8bffe73ef',
    exchange: 'kraken',
    label: 'Kraken 228',
    verified: true,
  },
  {
    address: '0xfc5c5d2cee3f827963882c4b0d6485e67505327c',
    exchange: 'kraken',
    label: 'Kraken 229',
    verified: true,
  },
  {
    address: '0xaee7cb232f11e652751696aa1d2cf14594fb2983',
    exchange: 'kraken',
    label: 'Kraken 234',
    verified: true,
  },
  {
    address: '0x8395b0bfe4bacdbf0898df631180bafcbd6fef56',
    exchange: 'kraken',
    label: 'Kraken 235',
    verified: true,
  },
  {
    address: '0x4be139343989eb8ca3cb98b284accc2eaca5c16b',
    exchange: 'kraken',
    label: 'Kraken 236',
    verified: true,
  },
  {
    address: '0x517061e21a3aaa14219d895d29e66e02a3a50e75',
    exchange: 'kraken',
    label: 'Kraken 237',
    verified: true,
  },
  {
    address: '0x109be9d7d5f64c8c391ced3a8f69bdef20fcaea9',
    exchange: 'kraken',
    label: 'Kraken 238',
    verified: true,
  },
  {
    address: '0xe6f5b8d420a8427e1718aa53bda05fc741a76fb6',
    exchange: 'kraken',
    label: 'Kraken 239',
    verified: true,
  },
  {
    address: '0x22af984f13dfb5c80145e3f9ee1050ae5a5fb651',
    exchange: 'kraken',
    label: 'Kraken 240',
    verified: true,
  },
  {
    address: '0xa6715eafe5d215b82cb9e90a9d6c8970a7c90033',
    exchange: 'kraken',
    label: 'Kraken 241',
    verified: true,
  },
  {
    address: '0x97065f80ba0675383589809de3f0f00ff4de80eb',
    exchange: 'kraken',
    label: 'Kraken 242',
    verified: true,
  },
  {
    address: '0xed20e72c966da53c6ac5bbcb0ad16ac9f25b8ab0',
    exchange: 'kraken',
    label: 'Kraken 243',
    verified: true,
  },
  {
    address: '0xc27c52de4e294eafbfede1521088f4e073c42fd2',
    exchange: 'kraken',
    label: 'Kraken 244',
    verified: true,
  },
  {
    address: '0x1e22cd8cfa52e950e1f1e78d7e9d59b20df63909',
    exchange: 'kraken',
    label: 'Kraken 245',
    verified: true,
  },
  {
    address: '0x7fdd9c6be666561e088607bda6047feb283fb4a5',
    exchange: 'kraken',
    label: 'Kraken 246',
    verified: true,
  },
  {
    address: '0x241361559feef80ef137302153bd9ed2f25db3ef',
    exchange: 'kraken',
    label: 'Kraken 247',
    verified: true,
  },
  {
    address: '0xd4039ecc40aeda0582036437cf3ec02845da4c13',
    exchange: 'kraken',
    label: 'Kraken ETH Staking 1',
    verified: true,
  },
  {
    address: '0xa40dfee99e1c85dc97fdc594b16a460717838703',
    exchange: 'kraken',
    label: 'Kraken ETH Staking 2',
    verified: true,
  },
  {
    address: '0xa1cdbc1a4178c17116bdb56c946e8b0757c8dcec',
    exchange: 'kraken',
    label: 'Kraken Gas Supplier 1',
    verified: true,
  },
  {
    address: '0x2c7c03cf85ec621bf997e425f550a6683d6d60f3',
    exchange: 'kraken',
    label: 'Kraken Gas Supplier 2',
    verified: true,
  },
  {
    address: '0xe9f7ecae3a53d2a67105292894676b00d1fab785',
    exchange: 'kraken',
    label: 'Kraken Hot Wallet',
    verified: true,
  },
  {
    address: '0xa24787320ede4cc19d800bf87b41ab9539c4da9d',
    exchange: 'kraken',
    label: 'Kraken Proxy 1',
    verified: true,
  },
  {
    address: '0xe6a02eefc2612b13f2b3b914009576ce5495ec0e',
    exchange: 'kraken',
    label: 'Kraken Withdrawals 1',
    verified: true,
  },
  {
    address: '0x4B6f17856215eab57c29ebfA18B0a0F74A3627bb',
    exchange: 'kraken',
    label: 'Kraken 205',
    verified: true,
  },
];

/**
 * Gemini hot wallets on Polygon
 */
const GEMINI_WALLETS: CexWalletAddress[] = [
  {
    address: '0xd24400ae8BfEBb18cA49Be86258a3C749cf46853',
    exchange: 'gemini',
    label: 'Gemini 1',
    verified: true,
  },
  {
    address: '0x5f65f7b609678448494De4C87521CdF6cEf1e932',
    exchange: 'gemini',
    label: 'Gemini 2',
    verified: true,
  },
];

/**
 * OKX hot wallets on Polygon
 */
const OKX_WALLETS: CexWalletAddress[] = [
  {
    address: '0x461249076B88189f8ac9418de28B365859e46BfD',
    exchange: 'okx',
    label: 'OKX 1',
    verified: true,
  },
  {
    address: '0x6cC5F688a315f3dC28A7781717a9A798a59fDA7b',
    exchange: 'okx',
    label: 'OKX 2',
    verified: true,
  },
  {
    address: '0x98ec059Dc3aDFBdd63429454aEB0c990FBA4A128',
    exchange: 'okx',
    label: 'OKX 3',
    verified: true,
  },
  {
    address: '0x06959153B974D0D5fDfd87D561db6d8d4FA0bb0B',
    exchange: 'okx',
    label: 'OKX 4',
    verified: true,
  },
  {
    address: '0x343d752bB710c5575E417edB3F9FA06241A4749A',
    exchange: 'okx',
    label: 'OKX 5',
    verified: true,
  },
  {
    address: '0x3aca1b103Fe6dC6d11edA343B3ff25a6450eEbeB',
    exchange: 'okx',
    label: 'OKX 6',
    verified: true,
  },
  {
    address: '0xC74e4C556A16390165C99B40aaBc39A87c358305',
    exchange: 'okx',
    label: 'OKX 7',
    verified: true,
  },
  {
    address: '0x1c62a58a11D88d71F936e0Ee799EaEBd74546894',
    exchange: 'okx',
    label: 'OKX 8',
    verified: true,
  },
];

/**
 * KuCoin hot wallets on Polygon
 */
const KUCOIN_WALLETS: CexWalletAddress[] = [
  { address: '0x2b5634c42055806a59e9107ed44d43c426e58258', exchange: 'kucoin', label: 'KuCoin 1', verified: true },
  { address: '0x689c56aef474df92d44a1b70850f808488f9769c', exchange: 'kucoin', label: 'KuCoin 2', verified: true },
  { address: '0xa1d8d972560c2f8144af871db508f0b0b10a3fbf', exchange: 'kucoin', label: 'KuCoin 3', verified: true },
  { address: '0x4ad64983349c49defe8d7a4686202d24b25d0ce8', exchange: 'kucoin', label: 'KuCoin 4', verified: true },
  { address: '0x1692e170361cefd1eb7240ec13d048fd9af6d667', exchange: 'kucoin', label: 'KuCoin 5', verified: true },
  { address: '0xd6216fc19db775df9774a6e33526131da7d19a2c', exchange: 'kucoin', label: 'KuCoin 6', verified: true },
  { address: '0xe59cd29be3be4461d79c0881d238cbe87d64595a', exchange: 'kucoin', label: 'KuCoin 7', verified: true },
  { address: '0x899b5d52671830f567bf43a14684eb14e1f945fe', exchange: 'kucoin', label: 'KuCoin 8', verified: true },
  { address: '0xf16e9b0d03470827a95cdfd0cb8a8a3b46969b91', exchange: 'kucoin', label: 'KuCoin 9', verified: true },
  { address: '0xcad621da75a66c7a8f4ff86d30a2bf981bfc8fdd', exchange: 'kucoin', label: 'KuCoin 10', verified: true },
  { address: '0xec30d02f10353f8efc9601371f56e808751f396f', exchange: 'kucoin', label: 'KuCoin 11', verified: true },
  { address: '0x738cf6903e6c4e699d1c2dd9ab8b67fcdb3121ea', exchange: 'kucoin', label: 'KuCoin 12', verified: true },
  { address: '0xd89350284c7732163765b23338f2ff27449e0bf5', exchange: 'kucoin', label: 'KuCoin 13', verified: true },
  { address: '0x88bd4d3e2997371bceefe8d9386c6b5b4de60346', exchange: 'kucoin', label: 'KuCoin 14', verified: true },
  { address: '0xb8e6d31e7b212b2b7250ee9c26c56cebbfbe6b23', exchange: 'kucoin', label: 'KuCoin 15', verified: true },
  { address: '0xe66845fd840fc7e489bcb61241fff5b7fc5f1f0e', exchange: 'kucoin', label: 'KuCoin 16', verified: true },
  { address: '0x03e6fa590cadcf15a38e86158e9b3d06ff3399ba', exchange: 'kucoin', label: 'KuCoin 17', verified: true },
  { address: '0xf3f094484ec6901ffc9681bcb808b96bafd0b8a8', exchange: 'kucoin', label: 'KuCoin 18', verified: true },
  { address: '0xa3f45e619ce3aae2fa5f8244439a66b203b78bcc', exchange: 'kucoin', label: 'KuCoin 19', verified: true },
  { address: '0xebb8ea128bbdff9a1780a4902a9380022371d466', exchange: 'kucoin', label: 'KuCoin 20', verified: true },
  { address: '0x45300136662dd4e58fc0df61e6290dffd992b785', exchange: 'kucoin', label: 'KuCoin 21', verified: true },
  { address: '0x635308e731a878741bfec299e67f5fd28c7553d9', exchange: 'kucoin', label: 'KuCoin 22', verified: true },
  { address: '0x9ac5637d295fea4f51e086c329d791cc157b1c84', exchange: 'kucoin', label: 'KuCoin 23', verified: true },
  { address: '0xcd5f3c15120a1021155174719ec5fcf2c75adf5b', exchange: 'kucoin', label: 'KuCoin 24', verified: true },
  { address: '0xb9f79fc4b7a2f5fb33493ab5d018db811c9c2f02', exchange: 'kucoin', label: 'KuCoin 25', verified: true },
  { address: '0xd91efec7e42f80156d1d9f660a69847188950747', exchange: 'kucoin', label: 'KuCoin 26', verified: true },
  { address: '0x4e75e27e5aa74f0c7a9d4897dc10ef651f3a3995', exchange: 'kucoin', label: 'KuCoin 27', verified: true },
  { address: '0x14ea40648fc8c1781d19363f5b9cc9a877ac2469', exchange: 'kucoin', label: 'KuCoin 28', verified: true },
  { address: '0x17a30350771d02409046a683b18fe1c13ccfc4a8', exchange: 'kucoin', label: 'KuCoin 29', verified: true },
  { address: '0x2a8c8b09bd77c13980495a959b26c1305166a57f', exchange: 'kucoin', label: 'KuCoin 30', verified: true },
  { address: '0x53f78a071d04224b8e254e243fffc6d9f2f3fa23', exchange: 'kucoin', label: 'KuCoin 31', verified: true },
  { address: '0x58edf78281334335effa23101bbe3371b6a36a51', exchange: 'kucoin', label: 'KuCoin 32', verified: true },
  { address: '0x7491f26a0fcb459111b3a1db2fbfc4035d096933', exchange: 'kucoin', label: 'KuCoin 33', verified: true },
  { address: '0x77f59b595cac829575e262b4c8bbcb17abadb33a', exchange: 'kucoin', label: 'KuCoin 34', verified: true },
  { address: '0x7b915c27a0ed48e2ce726ee40f20b2bf8a88a1b3', exchange: 'kucoin', label: 'KuCoin 35', verified: true },
  { address: '0x83c41363cbee0081dab75cb841fa24f3db46627e', exchange: 'kucoin', label: 'KuCoin 36', verified: true },
  { address: '0x9f4cf329f4cf376b7aded854d6054859dd102a2a', exchange: 'kucoin', label: 'KuCoin 37', verified: true },
  { address: '0xa152f8bb749c55e9943a3a0a3111d18ee2b3f94e', exchange: 'kucoin', label: 'KuCoin 38', verified: true },
  { address: '0x3ad7d43702bc2177cc9ec655b6ee724136891ef4', exchange: 'kucoin', label: 'KuCoin 39', verified: true },
  { address: '0xa649ffc455ac7c5acc1bc35726fce54e25eb59f9', exchange: 'kucoin', label: 'KuCoin 40', verified: true },
  { address: '0xaa99fc695eb1bbfb359fbad718c7c6dafc03a839', exchange: 'kucoin', label: 'KuCoin 41', verified: true },
  { address: '0x1dd9319a115d36bd0f71c276844f67171678e17b', exchange: 'kucoin', label: 'KuCoin 42', verified: true },
  { address: '0xf8ba3ec49212ca45325a2335a8ab1279770df6c0', exchange: 'kucoin', label: 'KuCoin 43', verified: true },
  { address: '0xf8da05c625a6e601281110cba52b156e714e1dc2', exchange: 'kucoin', label: 'KuCoin 44', verified: true },
  { address: '0xf97deb1c0bb4536ff16617d29e5f4b340fe231df', exchange: 'kucoin', label: 'KuCoin 45', verified: true },
  { address: '0xfb6a733bf7ec9ce047c1c5199f18401052eb062d', exchange: 'kucoin', label: 'KuCoin 46', verified: true },
  { address: '0x41e29c02713929f800419abe5770faa8a5b4dadc', exchange: 'kucoin', label: 'KuCoin 47', verified: true },
  { address: '0x441454b3d857fe365b7defe8cb3e4f498ec91eac', exchange: 'kucoin', label: 'KuCoin 48', verified: true },
  { address: '0x446b86a33e2a438f569b15855189e3da28d027ba', exchange: 'kucoin', label: 'KuCoin 49', verified: true },
  { address: '0xce0b6bfd578a5e90fb827ce6f86aa06355277f8c', exchange: 'kucoin', label: 'KuCoin 50', verified: true },
  { address: '0x4cf8800ccc0a56396f77b1e7c46160f5df0e09a5', exchange: 'kucoin', label: 'KuCoin 51', verified: true },
  { address: '0x18b0f4547a89fe4c5fe84f258bea3601fa281e9f', exchange: 'kucoin', label: 'KuCoin 52', verified: true },
  { address: '0x33a28d7a0c94599edb670fcce5dfa9d4c072314e', exchange: 'kucoin', label: 'KuCoin 53', verified: true },
  { address: '0x2d964ee844c35a72c6a9d498d54c8a9910cf6914', exchange: 'kucoin', label: 'KuCoin 54', verified: true },
  { address: '0xe58c8d45477d894bb9a1501bb0d0a32af8419eda', exchange: 'kucoin', label: 'KuCoin 55', verified: true },
  { address: '0xcded3bb9d2dc98f6e4e772095b48051acfb84df9', exchange: 'kucoin', label: 'KuCoin 56', verified: true },
  { address: '0x22dc53fc2ed383e4bf849b1054f1b86c127fde3e', exchange: 'kucoin', label: 'KuCoin 57', verified: true },
  { address: '0xf9ed457b149ad27fe2ad2eb734482a425fd6faae', exchange: 'kucoin', label: 'KuCoin 58', verified: true },
  { address: '0x58a1c909c5ec6cbf9c1df9ab3e9e2301ff707b6b', exchange: 'kucoin', label: 'KuCoin 59', verified: true },
  { address: '0x2933782b5a8d72f2754103d1489614f29bfa4625', exchange: 'kucoin', label: 'KuCoin 60', verified: true },
  { address: '0xdd276dc5223d0120f9bf1776f38957cc8da23cb0', exchange: 'kucoin', label: 'KuCoin 61', verified: true },
  { address: '0xe8c15aad9d4cd3f59c9dfa18828b91a8b2c49596', exchange: 'kucoin', label: 'KuCoin 62', verified: true },
  { address: '0xb514c67824443868d3a70352398f524ef6af6207', exchange: 'kucoin', label: 'KuCoin 63', verified: true },
  { address: '0x189b24f3eb15dc71b4fc57c5914e7e9b3246e449', exchange: 'kucoin', label: 'KuCoin 64', verified: true },
  { address: '0xcB014880de8b1E5f6c90CBcD2c232970cF3Aec32', exchange: 'kucoin', label: 'KuCoin 65', verified: true },
];

/**
 * MEXC hot wallets on Polygon
 */
const MEXC_WALLETS: CexWalletAddress[] = [
  { address: '0x75e89d5979e4f6fba9f97c104c2f0afb3f1dcb88', exchange: 'mexc', label: 'MEXC 1', verified: true },
  { address: '0x0211f3cedbef3143223d3acf0e589747933e8527', exchange: 'mexc', label: 'MEXC 2', verified: true },
  { address: '0x3cc936b795a188f0e246cbb2d74c5bd190aecf18', exchange: 'mexc', label: 'MEXC 3', verified: true },
  { address: '0x4982085c9e2f89f2ecb8131eca71afad896e89cb', exchange: 'mexc', label: 'MEXC 4', verified: true },
  { address: '0x2e8f79ad740de90dc5f5a9f0d8d9661a60725e64', exchange: 'mexc', label: 'MEXC 5', verified: true },
  { address: '0x83c1c224044ef8573e9a728dbb91013cf80827e6', exchange: 'mexc', label: 'MEXC 6', verified: true },
  { address: '0xdf90c9b995a3b10a5b8570a47101e6c6a29eb945', exchange: 'mexc', label: 'MEXC 7', verified: true },
  { address: '0x51e3d44172868acc60d68ca99591ce4230bc75e0', exchange: 'mexc', label: 'MEXC 8', verified: true },
  { address: '0xffb3118124cdaebd9095fa9a479895042018cac2', exchange: 'mexc', label: 'MEXC 9', verified: true },
  { address: '0x9b64203878f24eb0cdf55c8c6fa7d08ba0cf77e5', exchange: 'mexc', label: 'MEXC 10', verified: true },
  { address: '0x576b81f0c21edbc920ad63feeeb2b0736b018a58', exchange: 'mexc', label: 'MEXC 11', verified: true },
  { address: '0x8e1701cfd85258ddb8dfe89bc4c7350822b9601d', exchange: 'mexc', label: 'MEXC 12', verified: true },
  { address: '0x0162cd2ba40e23378bf0fd41f919e1be075f025f', exchange: 'mexc', label: 'MEXC 13', verified: true },
  { address: '0x4e3ae00e8323558fa5cac04b152238924aa31b60', exchange: 'mexc', label: 'MEXC 14', verified: true },
  { address: '0x9bb6a22da110c6c9bab745bcaf0ee142ee83af37', exchange: 'mexc', label: 'MEXC 15', verified: true },
  { address: '0xb86f1061e0d79e8319339d5fdbb187d4e7ad3300', exchange: 'mexc', label: 'MEXC 16', verified: true },
  { address: '0x4b68038e910941b7438e70a3943dcc4fd543715c', exchange: 'mexc', label: 'MEXC 17', verified: true },
  { address: '0x680178d61d910736153991660c5710841c440ec7', exchange: 'mexc', label: 'MEXC 18', verified: true },
  { address: '0x016c685d3379a515c64e7d85de8c0be11127f1d5', exchange: 'mexc', label: 'MEXC 19', verified: true },
  { address: '0x5c30940a4544ca845272fe97c4a27f2ed2cd7b64', exchange: 'mexc', label: 'MEXC 20', verified: true },
  { address: '0x9642b23ed1e01df1092b92641051881a322f5d4e', exchange: 'mexc', label: 'MEXC 21', verified: true },
];

/**
 * CoinW hot wallets on Polygon
 */
const COINW_WALLETS: CexWalletAddress[] = [
  { address: '0xab59487c43211da1d8b8e60479cad6aadc52cd1c', exchange: 'coinw', label: 'CoinW Gas Supplier 9', verified: true },
];

/**
 * Delta Exchange hot wallets on Polygon
 */
const DELTA_WALLETS: CexWalletAddress[] = [
  { address: '0xc07b9ddc7f87e76e682a7a4f3859586eef1c7efd', exchange: 'delta', label: 'Delta Exchange 1', verified: true },
  { address: '0x50a3f3b8855c2da88e56c7b0ef6e0e4a79f853f9', exchange: 'delta', label: 'Delta Exchange Binance Deposit 1', verified: true },
  { address: '0x1a7574d48c4960278e89b7e7e069e5b9809d7b67', exchange: 'delta', label: 'Delta Exchange Gas Supplier 1', verified: true },
];

/**
 * Gate.io hot wallets on Polygon
 */
const GATE_WALLETS: CexWalletAddress[] = [
  { address: '0x0d0707963952f2fba59dd06f2b425ace40b492fe', exchange: 'gate', label: 'Gate.io 1', verified: true },
  { address: '0x7793cd85c11a924478d358d49b05b37e91b5810f', exchange: 'gate', label: 'Gate.io 2', verified: true },
  { address: '0x1c4b70a3968436b9a0a9cf5205c787eb81bb558c', exchange: 'gate', label: 'Gate.io 3', verified: true },
  { address: '0x234ee9e35f8e9749a002fc42970d570db716453b', exchange: 'gate', label: 'Gate.io 4', verified: true },
  { address: '0xc882b111a75c0c657fc507c04fbfcd2cc984f071', exchange: 'gate', label: 'Gate.io 5', verified: true },
  { address: '0x05ee546c1a62f90d7acbffd6d846c9c54c7cf94c', exchange: 'gate', label: 'Gate.io 6', verified: true },
  { address: '0xb7715cb185990a1d7fede7bb5a3c369296018279', exchange: 'gate', label: 'Gate.io 10', verified: true },
];

/**
 * Bybit hot wallets on Polygon
 */
const BYBIT_WALLETS: CexWalletAddress[] = [
  { address: '0x1db92e2eebc8e0c075a02bea49a2935bcd2dfcf4', exchange: 'bybit', label: 'Bybit 1', verified: true },
  { address: '0xa7a93fd0a276fc1c0197a5b5623ed117786eed06', exchange: 'bybit', label: 'Bybit 2', verified: true },
  { address: '0xe1ab8c08294f8ee707d4efa458eab8bbeeb09215', exchange: 'bybit', label: 'Bybit 3', verified: true },
  { address: '0xee5b5b923ffce93a870b3104b7ca09c3db80047a', exchange: 'bybit', label: 'Bybit 4', verified: true },
  { address: '0xf89d7b9c864f589bbf53a82105107622b35eaa40', exchange: 'bybit', label: 'Bybit 5', verified: true },
  { address: '0xbaed383ede0e5d9d72430661f3285daa77e9439f', exchange: 'bybit', label: 'Bybit 6', verified: true },
  { address: '0xf5f3436a05b5ced2490dae07b86eb5bbd02782aa', exchange: 'bybit', label: 'Bybit 7', verified: true },
  { address: '0x4230c402c08cb66dcf3820649a115e54661fce9d', exchange: 'bybit', label: 'Bybit 8', verified: true },
  { address: '0x3d5202a0564de9b05ecd07c955bcca964585ea03', exchange: 'bybit', label: 'Bybit 9', verified: true },
  { address: '0x1e32760a3285550278aeafa776e5641bc581c845', exchange: 'bybit', label: 'Bybit 10', verified: true },
  { address: '0x88a1493366d48225fc3cefbdae9ebb23e323ade3', exchange: 'bybit', label: 'Bybit 11', verified: true },
  { address: '0x12136e543b551ecdfdea9a0ed23ed0eff5505ee0', exchange: 'bybit', label: 'Bybit 12', verified: true },
  { address: '0x4ce053dfe58541e08f149c1050eb3df09d7a40bc', exchange: 'bybit', label: 'Bybit 13', verified: true },
  { address: '0xd8db73f025adf9f1f6a754a4b0b7a9349b7ff128', exchange: 'bybit', label: 'Bybit 14', verified: true },
  { address: '0x57b83aaff113ef81a729b63274ed6f17404c9ba6', exchange: 'bybit', label: 'Bybit 15', verified: true },
  { address: '0x3ddb5d1247adc837cec3ba81edc923a4a230aa8f', exchange: 'bybit', label: 'Bybit 16', verified: true },
  { address: '0x0d4dc3b8becc98782309e443a6da4b9455b5ca48', exchange: 'bybit', label: 'Bybit 17', verified: true },
  { address: '0x1c3944173abee256456b1498299fc501ad5bbd6f', exchange: 'bybit', label: 'Bybit 18', verified: true },
  { address: '0xa6a9f45518881a788e29f82a032f9d400177d2b6', exchange: 'bybit', label: 'Bybit 19', verified: true },
  { address: '0xb5873e333161e5b45adac57379ec2b15d861178d', exchange: 'bybit', label: 'Bybit 20', verified: true },
  { address: '0x0051ef9259c7ec0644a80e866ab748a2f30841b3', exchange: 'bybit', label: 'Bybit 21', verified: true },
  { address: '0x828424517f9f04015db02169f4026d57b2b07229', exchange: 'bybit', label: 'Bybit 22', verified: true },
  { address: '0x869bcee3a0bad2211a65c63ec47dbd3d85a84d68', exchange: 'bybit', label: 'Bybit 23', verified: true },
  { address: '0x318d2aae4c99c2e74f7b5949fa1c34df837789b8', exchange: 'bybit', label: 'Bybit 24', verified: true },
  { address: '0x18e296053cbdf986196903e889b7dca7a73882f6', exchange: 'bybit', label: 'Bybit 25', verified: true },
  { address: '0x3bd0e57e2917d3d9a93f479b3a23b28c3f31a789', exchange: 'bybit', label: 'Bybit 26', verified: true },
  { address: '0x4865d4bcf4ab92e1c9ba5011560e7d4c36f54106', exchange: 'bybit', label: 'Bybit 27', verified: true },
  { address: '0xa1abfa21f80ecf401bd41365adbb6fef6fefdf09', exchange: 'bybit', label: 'Bybit 28', verified: true },
  { address: '0x72187db55473b693ded367983212fe2db3768829', exchange: 'bybit', label: 'Bybit 29', verified: true },
  { address: '0xcab3f132a11e5b723fc20ddab8bb1b858d00a8e8', exchange: 'bybit', label: 'Bybit 30', verified: true },
  { address: '0xec949f12a3acab835f3eed8b54b7361a8fbb3ee0', exchange: 'bybit', label: 'Bybit 31', verified: true },
  { address: '0x25c7d768a7d53e6ebe5590c621437126c766e1ea', exchange: 'bybit', label: 'Bybit 32', verified: true },
  { address: '0xc22166664e820cda6bf4cedbdbb4fa1e6a84c440', exchange: 'bybit', label: 'Bybit 33', verified: true },
  { address: '0xf2f40c3bb444288f6f64d8336dcc14dbd929fd94', exchange: 'bybit', label: 'Bybit 34', verified: true },
  { address: '0x63bee4a7e4aa5d76dc6ab9b9d1852aabb9a40936', exchange: 'bybit', label: 'Bybit 35', verified: true },
  { address: '0x6b9b774502e6afaafcac84f840ac8a0844a1abe3', exchange: 'bybit', label: 'Bybit 36', verified: true },
  { address: '0x80a9b4aab0ad3c73cce1c9223236b722db5d6628', exchange: 'bybit', label: 'Bybit 37', verified: true },
  { address: '0xdae4fdcb7fc93738ec6d5b1ea92b7c7f75e4f2f6', exchange: 'bybit', label: 'Bybit 38', verified: true },
  { address: '0xbce9aecd3985d4cbb9d273453159a26301fa02ef', exchange: 'bybit', label: 'Bybit 39', verified: true },
  { address: '0x260b364fe0d3d37e6fd3cda0fa50926a06c54cea', exchange: 'bybit', label: 'Bybit 40', verified: true },
  { address: '0x2ffcb90d6455b99ec14b4842f82b504dae80736b', exchange: 'bybit', label: 'Bybit 41', verified: true },
  { address: '0xc3350595ed42ebe94556277bc77d257c76065291', exchange: 'bybit', label: 'Bybit 42', verified: true },
  { address: '0x79ae8c1b31b1e61c4b9d1040217a051f954d4433', exchange: 'bybit', label: 'Bybit 43', verified: true },
  { address: '0x3fb00e38602c6a501e19eda24787f40bccef0432', exchange: 'bybit', label: 'Bybit 44', verified: true },
];

/**
 * Crypto.com hot wallets on Polygon
 */
const CRYPTO_COM_WALLETS: CexWalletAddress[] = [
  { address: '0xfa0b641678F5115ad8a8De5752016bD1359681b9', exchange: 'crypto.com', label: 'Crypto.com 1', verified: true },
  { address: '0xAe45a8240147E6179ec7c9f92c5A18F9a97B3fCA', exchange: 'crypto.com', label: 'Crypto.com 2', verified: true },
];

/**
 * Moonpay hot wallets on Polygon
 */
const MOONPAY_WALLETS: CexWalletAddress[] = [
  { address: '0x1440ec793aE50fA046B95bFeCa5aF475b6003f9e', exchange: 'moonpay', label: 'Moonpay 1', verified: true },
  { address: '0xD42f958E1C3e2a10e5d66343c4c9a57726E5b4b6', exchange: 'moonpay', label: 'Moonpay 2', verified: true },
  { address: '0x22F6CC8738308a8c92a6a71ea67832463d1Fec0d', exchange: 'moonpay', label: 'Moonpay 3', verified: true },
];

/**
 * Revolut hot wallets on Polygon
 */
const REVOLUT_WALLETS: CexWalletAddress[] = [
  { address: '0xb23360CCDd9Ed1b15D45E5d3824Bb409C8D7c460', exchange: 'revolut', label: 'Revolut 1', verified: true },
  { address: '0xF7C8dA79da4CB294C4f55DFeBB1B404E3E38d921', exchange: 'revolut', label: 'Revolut 2', verified: true },
];

/**
 * Blofin hot wallets on Polygon
 */
const BLOFIN_WALLETS: CexWalletAddress[] = [
  { address: '0x7Ff8bbf9C8AB106db589e7863fb100525F61CCe5', exchange: 'blofin', label: 'Blofin 1', verified: true },
];

/**
 * Robinhood hot wallets on Polygon
 */
const ROBINHOOD_WALLETS: CexWalletAddress[] = [
  { address: '0xa26e73C8E9507D50bF808B7A2CA9D5dE4fcC4A04', exchange: 'robinhood', label: 'Robinhood 1', verified: true },
];

/**
 * All CEX wallets combined
 */
export const ALL_CEX_WALLETS: CexWalletAddress[] = [
  ...COINBASE_WALLETS,
  ...BINANCE_WALLETS,
  ...KRAKEN_WALLETS,
  ...GEMINI_WALLETS,
  ...OKX_WALLETS,
  ...KUCOIN_WALLETS,
  ...MEXC_WALLETS,
  ...COINW_WALLETS,
  ...DELTA_WALLETS,
  ...GATE_WALLETS,
  ...BYBIT_WALLETS,
  ...CRYPTO_COM_WALLETS,
  ...MOONPAY_WALLETS,
  ...REVOLUT_WALLETS,
  ...BLOFIN_WALLETS,
  ...ROBINHOOD_WALLETS,
];

/**
 * Map of address -> exchange for fast lookups
 */
export const CEX_WALLET_MAP = new Map<string, CexWalletAddress['exchange']>(
  ALL_CEX_WALLETS.map((wallet) => [
    wallet.address.toLowerCase(),
    wallet.exchange,
  ])
);

/**
 * Check if an address is a known CEX wallet
 */
export function isCexWallet(address: string): boolean {
  return CEX_WALLET_MAP.has(address.toLowerCase());
}

/**
 * Get the exchange name for a CEX wallet address
 * Returns undefined if not a known CEX wallet
 */
export function getCexExchange(
  address: string
): CexWalletAddress['exchange'] | undefined {
  return CEX_WALLET_MAP.get(address.toLowerCase());
}

/**
 * Get all wallets for a specific exchange
 */
export function getWalletsByExchange(
  exchange: CexWalletAddress['exchange']
): CexWalletAddress[] {
  return ALL_CEX_WALLETS.filter((wallet) => wallet.exchange === exchange);
}
