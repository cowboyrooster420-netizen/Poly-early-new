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
 * Last updated: 2025-01-20
 */

export interface CexWalletAddress {
  address: string;
  exchange: 'coinbase' | 'binance' | 'kraken' | 'gemini' | 'okx' | 'kucoin' | 'bybit';
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
    address: '0x267be1C1D684F78cb4F6a176C4911b741E4Ffdc0',
    exchange: 'kraken',
    label: 'Kraken 1',
    verified: true,
  },
  {
    address: '0x53d284357ec70cE289D6D64134DfAc8E511c8a3D',
    exchange: 'kraken',
    label: 'Kraken 2',
    verified: true,
  },
  {
    address: '0x0A869d79a7052C7f1b55a8EbAbbEa3420F0D1E13',
    exchange: 'kraken',
    label: 'Kraken 3',
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
];

/**
 * KuCoin hot wallets on Polygon
 */
const KUCOIN_WALLETS: CexWalletAddress[] = [
  {
    address: '0x689C56AEf474Df92D44A1B70850f808488F9769C',
    exchange: 'kucoin',
    label: 'KuCoin 1',
    verified: true,
  },
  {
    address: '0x2B5634C42055806a59e9107ED44D43c426E58258',
    exchange: 'kucoin',
    label: 'KuCoin 2',
    verified: true,
  },
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
 * All CEX wallets combined
 */
export const ALL_CEX_WALLETS: CexWalletAddress[] = [
  ...COINBASE_WALLETS,
  ...BINANCE_WALLETS,
  ...KRAKEN_WALLETS,
  ...GEMINI_WALLETS,
  ...OKX_WALLETS,
  ...KUCOIN_WALLETS,
  ...BYBIT_WALLETS,
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
