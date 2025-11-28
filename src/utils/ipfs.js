// utils/ipfs.js
import axios from 'axios';

export async function uploadToIPFS(file) {
  try {
    const formData = new FormData();
    formData.append('file', file);

    const response = await axios.post(
      'https://api.pinata.cloud/pinning/pinFileToIPFS',
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
          pinata_api_key: import.meta.env.VITE_PINATA_API_KEY,
          pinata_secret_api_key: import.meta.env.VITE_PINATA_SECRET_KEY,
        },
      }
    );

    const ipfsHash = response.data.IpfsHash;
    return `https://aquamarine-working-thrush-698.mypinata.cloud/ipfs/${ipfsHash}`;
  } catch (error) {
    console.error('IPFS upload error:', error);
    throw new Error('Failed to upload image to IPFS');
  }
}