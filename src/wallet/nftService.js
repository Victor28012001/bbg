// src/wallet/nftService.js

export class NFTService {
    /**
     * @param {Object} walletService - Your wallet connection/service
     * walletService should provide:
     *   - user: { address, signTransaction }
     *   - connection: Sui connection object with `buildCustomTransaction` and `sendCustomTransaction`
     */
    constructor(walletService) {
        this.wallet = walletService;

        // Replace this with the PackageID you got from publishing
        this.packageId = "0xfe0784e0f9a40acc667120b02fdacce2e3a6653ed3545be4b04e4b082bf063dc";

        // Module name as published
        this.moduleName = "LevelNFT";
    }

    /**
     * Mint a level NFT for the user
     * @param {number} level - The level number to mint NFT for
     */
    async mintLevelNFT(level) {
        const user = this.wallet.user;
        if (!user) throw new Error("User not logged in");

        // Build the transaction for your Move call
        const mintTx = await this.wallet.connection.buildCustomTransaction({
            packageObjectId: this.packageId,
            module: this.moduleName,
            func: "mint_level",
            typeArgs: [], // if your Move function uses generic type args, add them here
            args: [
                user.address,          // recipient address
                level,                 // level number (u8 in Move)
                `Level ${level} Completion Badge` // name string
            ],
            gasBudget: 5000000 // adjust if needed
        });

        // Sign the transaction
        const signature = await this.wallet.signZkTx(user, mintTx.rawTransaction);

        // Send the transaction
        const result = await this.wallet.connection.sendCustomTransaction({
            hash: mintTx.hash,
            txBytes: mintTx.rawTransaction,
            userSig: signature
        });

        return result;
    }

    /**
     * Optional: check all NFTs owned by the user
     */
    async getOwnedNFTs() {
        const user = this.wallet.user;
        if (!user) throw new Error("User not logged in");

        return await this.wallet.connection.getObjectsOwnedByAddress(user.address);
    }
}
