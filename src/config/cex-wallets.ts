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
  exchange: 'coinbase' | 'binance' | 'kraken' | 'gemini' | 'okx' | 'kucoin';
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
  {
    address: '0xF977814e90dA44bFA03b6295A0616a897441aceC',
    exchange: 'binance',
    label: 'Binance 1',
    verified: true,
  },
  {
    address: '0x8894E0a0c962CB723c1976a4421c95949bE2D4E3',
    exchange: 'binance',
    label: 'Binance 2',
    verified: true,
  },
  {
    address: '0xf89d7b9c864f589bbF53a82105107622B35EaA40',
    exchange: 'binance',
    label: 'Binance 3',
    verified: true,
  },
  {
    address: '0xE0F0cfDe7Ee664943906f17F7f14342E0a5E5380',
    exchange: 'binance',
    label: 'Binance 4',
    verified: true,
  },
  {
    address: '0x5a52E96BAcdaBb82fd05763E25335261B270Efcb',
    exchange: 'binance',
    label: 'Binance 5',
    verified: true,
  },
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
 * All CEX wallets combined
 */
export const ALL_CEX_WALLETS: CexWalletAddress[] = [
  ...COINBASE_WALLETS,
  ...BINANCE_WALLETS,
  ...KRAKEN_WALLETS,
  ...GEMINI_WALLETS,
  ...OKX_WALLETS,
  ...KUCOIN_WALLETS,
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
