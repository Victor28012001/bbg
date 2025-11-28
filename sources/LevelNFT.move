module game_nft::LevelNFT {
    use sui::object::{Self, UID};
    use sui::transfer;
    use sui::tx_context::{Self, TxContext};
    use std::string;

    public struct LevelNFT has key, store {
        id: UID,
        owner: address,
        level: u8,
        name: vector<u8>,
    }

    public entry fun mint_level(recipient: address, level: u8, name: vector<u8>, ctx: &mut TxContext) {
        let nft = LevelNFT {
            id: object::new(ctx),
            owner: recipient,
            level,
            name,
        };
        transfer::public_transfer(nft, recipient);
    }
}
