// src/wallet/walletService.js
import { Connection, clusterApiUrl } from "@onelabs/wallet";
import NodeRSA from 'node-rsa';
import _ from 'lodash';
import { SuiClient, getFullnodeUrl } from '@onelabs/sui/client';
import { Ed25519Keypair } from '@onelabs/sui/keypairs/ed25519';
import { fromB64 } from '@onelabs/bcs';
import * as zk from '@onelabs/sui/zklogin';

export class WalletService {
    constructor() {
        this.connection = new Connection(clusterApiUrl("devnet"), {});
        this.sui = new SuiClient({ url: getFullnodeUrl('devnet') });
        this.user = null;
    }

    rsaEncrypt(options, privateKey) {
        let rsa = new NodeRSA(privateKey, "pkcs8-private");
        let keys = _.sortBy(_.keys(options));
        let joined = keys.map(k => `${k}=${options[k]}`).join("&");
        options.merchantSign = rsa.sign(Buffer.from(joined), "base64", "utf8");
        return options;
    }

    async getSystemState() {
        const state = await this.sui.getLatestSuiSystemState();
        return _.pick(state, ["epoch", "epochDurationMs", "epochStartTimestampMs"]);
    }

    async generateZk() {
        const sys = await this.getSystemState();
        const eph = new Ed25519Keypair();
        const maxEpoch = Number(sys.epoch) + 2;
        const randomness = zk.generateRandomness();
        const nonce = zk.generateNonce(eph.getPublicKey(), maxEpoch, randomness);

        return {
            suiSysState: sys,
            maxEpoch,
            randomness,
            nonce,
            ephemeralKeyPair: {
                secretKey: eph.getSecretKey(),
                keyScheme: eph.getKeyScheme(),
            },
            extendedEphemeralPublicKey: zk.getExtendedEphemeralPublicKey(eph.getPublicKey())
        };
    }

    async requestSms(user) {
        return this.connection.requestSmsCode(this.rsaEncrypt({
            merchantId: user.merchantId,
            mobile: user.mobile,
            mobilePrefix: user.mobilePrefix,
            timestamp: Date.now(),
        }, user.merchantKey));
    }

    async confirmSms(user, smsCode) {
        const result = await this.connection.authenticateSms({
            code: user.code,
            mobile: user.mobile,
            mobilePrefix: user.mobilePrefix,
            smsCode,
        });
        return result.code;
    }

    async zkLoginUser(user, authCode) {
        user.zk = await this.generateZk();

        let token = await this.connection.zkLogin({
            code: authCode,
            nonce: user.zk.nonce,
        });

        this.connection.setToken({ ACCESS_TOKEN: token.accessToken });

        user.accessToken = token.accessToken;
        user.jwtToken = token.jwtToken;
        user.salt = token.salt;
        user.decodedJwt = token.accessTokenProfile;

        user.addressSeed = zk.genAddressSeed(
            token.salt, "sub",
            token.accessTokenProfile.sub,
            token.accessTokenProfile.aud
        ).toString();

        user.address = zk.jwtToAddress(token.jwtToken, token.salt);
        user.did = token.did;

        user.zk.zkpoof = await this.connection.getZkProofs({
            maxEpoch: user.zk.maxEpoch,
            jwtRandomness: user.zk.randomness,
            extendedEphemeralPublicKey: user.zk.extendedEphemeralPublicKey,
            jwt: user.jwtToken,
            salt: user.salt,
            keyClaimName: "sub",
        });

        this.user = user;
        return user;
    }

    async signZkTx(user, raw) {
        const { signature: userSig } = await Ed25519Keypair
            .fromSecretKey(user.zk.ephemeralKeyPair.secretKey)
            .signTransaction(fromB64(raw));

        return zk.getZkLoginSignature({
            inputs: { ...user.zk.zkpoof, addressSeed: user.addressSeed },
            maxEpoch: user.zk.maxEpoch,
            userSignature: userSig
        });
    }

    async sendUSDH(amount, to) {
        const tx = await this.connection.buildTransferTransaction({
            amount,
            currency: "USDH",
            remark: "Level reward",
            fromAddress: this.user.address,
            toAddress: to
        });

        const sig = await this.signZkTx(this.user, tx.rawTransaction);

        return await this.connection.sendTransferTransaction({
            hash: tx.hash,
            txBytes: tx.rawTransaction,
            userSig: sig
        });
    }
}
