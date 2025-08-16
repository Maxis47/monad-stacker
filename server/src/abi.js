import { parseAbi } from 'viem';

export const ABI = parseAbi([
  // Registrasi game (sekali)
  'function registerGame(address _game,string _name,string _image,string _url)',
  // Submit penambahan skor dan jumlah transaksi pemain
  'function updatePlayerData(address player,uint256 scoreAmount,uint256 transactionAmount)'
]);