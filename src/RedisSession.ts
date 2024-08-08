/**
 * tgsnake - Telegram MTProto framework for nodejs.
 * Copyright (C) 2024 butthx <https://github.com/butthx>
 *
 * THIS FILE IS PART OF TGSNAKE
 *
 * tgsnake is a free software : you can redistribute it and/or modify
 * it under the terms of the MIT License as published.
 */
import { Logger } from './Logger';
import { Storages, Raws } from '@tgsnake/core';
import { createClient } from 'redis';
import * as Version from './Version';

export interface RedisOptions {
  /**
   * How long should we keep peers in the cache. (in seconds)
   */
  peerExp?: number;
  /**
   * How long should we keep the login information in the cache. (in seconds)
   */
  sessionExp?: number;
  /**
   * separator between session name and session property. (default is ":").
   */
  sessionDelim?: string;
  /**
   * Connect to redis using url. (default is localhost).
   */
  redisUrl?: string;
  /**
   * When redis got error, this function will be called.
   */
  redisError?: { (error: any): any };
}

export class RedisSession extends Storages.BaseSession {
  protected _peerExp?: number;
  protected _sessionExp?: number;
  protected _sessionDelim!: string;
  protected _redisClient!: any; // should be pass with RedisClient.
  protected _redisError?: { (error: any): any };
  protected redisUrl?: string;
  protected sessionName!: string;
  protected connected: boolean = false;
  constructor(sessionName: string, options?: RedisOptions) {
    super();
    this.sessionName = sessionName;
    this._peerExp = options?.peerExp;
    this._sessionExp = options?.sessionExp;
    this._sessionDelim = options?.sessionDelim || ':';
    this.redisUrl = options?.redisUrl;
    this._redisError = options?.redisError;
    this._redisClient = createClient({ ...(this.redisUrl ? { url: this.redisUrl } : {}) });
    this._redisClient.on('error', (error: any) => {
      Logger.error(error);
      if (this._redisError) {
        return this._redisError(error);
      }
      return;
    });
  }

  async setAddress(dcId: number, ip: string, port: number, testMode: boolean) {
    await this._connect();
    const sessionName = `${this.sessionName}${this._sessionDelim}`;
    this._dcId = dcId ?? 2;
    this._ip = ip;
    this._port = port ?? 443;
    this._testMode = testMode;
    await this._set(`${sessionName}dcId`, String(dcId), this._sessionExp);
    await this._set(`${sessionName}ip`, String(ip), this._sessionExp);
    await this._set(`${sessionName}port`, String(port), this._sessionExp);
    await this._set(`${sessionName}testMode`, String(testMode), this._sessionExp);
  }
  async setAuthKey(authKey: Buffer, dcId: number) {
    if (dcId !== this._dcId) return;
    await this._connect();
    this._authKey = authKey;
    const sessionName = `${this.sessionName}${this._sessionDelim}`;
    await this._set(`${sessionName}authKey`, authKey.toString('hex'), this._sessionExp);
  }
  async setApiId(apiId: number) {
    await this._connect();
    const sessionName = `${this.sessionName}${this._sessionDelim}`;
    this._apiId = apiId;
    await this._set(`${sessionName}apiId`, String(apiId), this._sessionExp);
  }
  async setIsBot(isbot: boolean) {
    await this._connect();
    const sessionName = `${this.sessionName}${this._sessionDelim}`;
    this._isBot = isbot;
    await this._set(`${sessionName}isBot`, String(isbot), this._sessionExp);
  }
  async setUserId(userId: bigint) {
    await this._connect();
    const sessionName = `${this.sessionName}${this._sessionDelim}`;
    this._userId = userId;
    await this._set(`${sessionName}userId`, String(userId), this._sessionExp);
  }
  async load() {
    Logger.info(`Using version: ${Version.version} - ${Version.getType()}.`);
    await this._connect();
    const sessionName = `${this.sessionName}${this._sessionDelim}`;
    const ip = await this._redisClient.get(`${sessionName}ip`);
    const dcId = await this._redisClient.get(`${sessionName}dcId`);
    const port = await this._redisClient.get(`${sessionName}port`);
    const authKey = await this._redisClient.get(`${sessionName}authKey`);
    const testMode = await this._redisClient.get(`${sessionName}testMode`);
    const apiId = await this._redisClient.get(`${sessionName}apiId`);
    const userId = await this._redisClient.get(`${sessionName}userId`);
    const isBot = await this._redisClient.get(`${sessionName}isBot`);
    if (ip) {
      Logger.debug(`Found ip: ${ip}.`);
      this._ip = ip;
    }
    if (dcId) {
      Logger.debug(`Found dcId: ${dcId}.`);
      this._dcId = Number(dcId);
    }
    if (port) {
      Logger.debug(`Found port: ${port}.`);
      this._port = Number(port);
    }
    if (authKey) {
      Logger.debug(`Found authKey: ${Buffer.from(authKey, 'hex').length} bytes.`);
      this._authKey = Buffer.from(authKey, 'hex');
    }
    if (testMode) {
      Logger.debug(`Found testMode: ${testMode}.`);
      this._testMode = Boolean(testMode === 'true');
    }
    if (apiId) {
      Logger.debug(`Found apiId: ${apiId}.`);
      this._apiId = Number(apiId);
    }
    if (userId) {
      Logger.debug(`Found userId: ${userId}.`);
      this._userId = BigInt(userId);
    }
    if (isBot) {
      Logger.debug(`Found isBot: ${isBot}.`);
      this._isBot = Boolean(isBot === 'true');
    }
  }
  async delete() {
    await this._connect();
    const sessionName = `${this.sessionName}${this._sessionDelim}`;
    for await (const key of this._redisClient.scanIterator()) {
      if (String(key).startsWith(sessionName)) {
        Logger.debug(`Deleting: ${key}`);
        await this._redisClient.del(key);
      }
    }
  }
  async updatePeers(
    peers: Array<
      [id: bigint, accessHash: bigint, type: string, username?: Array<string>, phoneNumber?: string]
    >,
  ) {
    await this._connect();
    const sessionName = `${this.sessionName}${this._sessionDelim}`;
    Logger.debug(`Updating ${peers.length} peers`);
    for (let peer of peers) {
      let bytes = await buildBytesFromPeer(peer);
      this._set(
        `${sessionName}peer${this._sessionDelim}${peer[0]}`,
        bytes.toString('hex'),
        this._peerExp,
      );
    }
  }
  async updateSecretChats(chats: Array<Storages.SecretChat>) {
    await this._connect();
    const sessionName = `${this.sessionName}${this._sessionDelim}`;
    Logger.debug(`Updating ${chats.length} secret chats`);
    for (let chat of chats) {
      let bytes = await buildBytesFromSecretChat(chat);
      this._set(
        `${sessionName}e2e${this._sessionDelim}${chat.id}`,
        bytes.toString('hex'),
        this._peerExp,
      );
    }
  }
  async getSecretChatById(id: number) {
    await this._connect();
    Logger.debug(`Getting secret chat by id: ${id}`);
    const sessionName = `${this.sessionName}${this._sessionDelim}`;
    let bytes = this._redisClient.get(`${sessionName}e2e${this._sessionDelim}${id}`);
    if (bytes) {
      let chat = await buildSecretChatFromBytes(Buffer.from(bytes, 'hex'));
      return chat;
    }
  }
  async getPeerById(id: bigint) {
    await this._connect();
    Logger.debug(`Getting peer by id: ${id}`);
    const sessionName = `${this.sessionName}${this._sessionDelim}`;
    let bytes = this._redisClient.get(`${sessionName}peer${this._sessionDelim}${id}`);
    if (bytes) {
      let peer = await buildPeerFromBytes(Buffer.from(bytes, 'hex'));
      return Storages.getInputPeer(peer[0], peer[1], peer[2]);
    }
  }
  async getPeerByUsername(username: string) {
    await this._connect();
    Logger.debug(`Getting peer by username: ${username}`);
    const sessionName = `${this.sessionName}${this._sessionDelim}`;
    for (let key of this._redisClient.scanIterator()) {
      if (String(key).startsWith(`${sessionName}peer`)) {
        let bytes = await this._redisClient.get(key);
        if (bytes) {
          let peer = await buildPeerFromBytes(Buffer.from(bytes, 'hex'));
          if (Array.isArray(peer[3]) && peer[3].includes(username.toLowerCase())) {
            return Storages.getInputPeer(peer[0], peer[1], peer[2]);
          }
        }
      }
    }
  }
  async getPeerByPhoneNumber(phoneNumber: string) {
    await this._connect();
    Logger.debug(`Getting peer by phone number: ${phoneNumber}`);
    const sessionName = `${this.sessionName}${this._sessionDelim}`;
    for (let key of this._redisClient.scanIterator()) {
      if (String(key).startsWith(`${sessionName}peer`)) {
        let bytes = await this._redisClient.get(key);
        if (bytes) {
          let peer = await buildPeerFromBytes(Buffer.from(bytes, 'hex'));
          if (peer[4] && peer[4] === phoneNumber) {
            return Storages.getInputPeer(peer[0], peer[1], peer[2]);
          }
        }
      }
    }
  }
  async removeSecretChatById(id: number) {
    await this._connect();
    Logger.debug(`Removing secret chat by id: ${id}`);
    const sessionName = `${this.sessionName}${this._sessionDelim}`;
    let bytes = this._redisClient.get(`${sessionName}e2e${this._sessionDelim}${id}`);
    if (bytes) {
      await this._redisClient.del(`${sessionName}e2e${this._sessionDelim}${id}`);
    }
    return true;
  }
  /**
   * Save content to Redis Cache.
   * @param key {String} - Key to identify data.
   * @param value {String} - Data will be saved on cache.
   * @param exp {Number} - How long should we store the data. (in seconds)
   */
  private async _set(key: string, value: string, exp?: number) {
    if (exp !== undefined) {
      return await this._redisClient.set(key, value, {
        EX: exp,
      });
    } else {
      return await this._redisClient.set(key, value);
    }
  }
  /**
   * Connecting client to redis server.
   */
  private async _connect() {
    if (!this.connected) {
      Logger.debug(`Connecting to redis.`);
      await this._redisClient.connect();
      Logger.debug(`Connected to redis.`);
      this.connected = true;
    }
  }
}
/**
 * Creating valid bytes from peer schema.
 * @param peer {Array} - Peer will be convert to bytes
 */
export function buildBytesFromPeer(
  peer: [
    id: bigint,
    accessHash: bigint,
    type: string,
    username?: Array<string>,
    phoneNumber?: string,
  ],
): Buffer {
  let bytes = new Raws.BytesIO();
  let flags = 0;
  if (peer[3] && peer[3].length) {
    flags |= 1 << 4;
  }
  if (peer[4]) {
    flags |= 1 << 5;
  }
  bytes.write(Raws.Primitive.Int.write(flags));
  bytes.write(Raws.Primitive.Long.write(peer[0]));
  bytes.write(Raws.Primitive.Long.write(peer[1]));
  bytes.write(Raws.Primitive.String.write(peer[2]));
  if (peer[3] && peer[3].length) {
    bytes.write(Raws.Primitive.Vector.write(peer[3], Raws.Primitive.String));
  }
  if (peer[4]) {
    bytes.write(Raws.Primitive.String.write(peer[4]));
  }
  return Buffer.concat([Buffer.from([2]), bytes.buffer]);
}
/**
 * Creating valid peer schema from bytes.
 * @param bytes {Buffer} - Bytes will be converted to peer schema.
 */
export async function buildPeerFromBytes(
  bytes: Buffer,
): Promise<
  [id: bigint, accessHash: bigint, type: string, username?: Array<string>, phoneNumber?: string]
> {
  // @ts-ignore
  let results: Array<any> = [];
  if (bytes[0] === 2) {
    let b = new Raws.BytesIO(bytes.slice(1));
    let flags = await Raws.Primitive.Int.read(b);
    results.push(await Raws.Primitive.Long.read(b));
    results.push(await Raws.Primitive.Long.read(b));
    results.push(await Raws.Primitive.String.read(b));
    if (flags & (1 << 4)) {
      results.push(await Raws.Primitive.String.read(b));
    }
    if (flags & (1 << 5)) {
      results.push(await Raws.Primitive.String.read(b));
    }
  } else {
    let b = new Raws.BytesIO(bytes);
    let flags = await Raws.Primitive.Int.read(b);
    results.push(await Raws.Primitive.Long.read(b));
    results.push(await Raws.Primitive.Long.read(b));
    results.push(await Raws.Primitive.String.read(b));
    if (flags & (1 << 4)) {
      results.push([await Raws.Primitive.String.read(b)]);
    }
    if (flags & (1 << 5)) {
      results.push(await Raws.Primitive.String.read(b));
    }
  }
  return results as unknown as [
    id: bigint,
    accessHash: bigint,
    type: string,
    username?: Array<string>,
    phoneNumber?: string,
  ];
}

export function buildBytesFromSecretChat(secretChat: Storages.SecretChat): Buffer {
  let bytes = new Raws.BytesIO();
  let flags = 0;
  if (secretChat.rekeyStep) {
    flags |= 1 << 3;
  }
  if (secretChat.rekeyExchange) {
    flags |= 1 << 4;
  }
  if (secretChat.adminId) {
    flags |= 1 << 5;
  }
  if (secretChat.ttl) {
    flags |= 1 << 6;
  }
  bytes.write(Raws.Primitive.Int.write(flags));
  bytes.write(Raws.Primitive.Int.write(secretChat.id));
  bytes.write(Raws.Primitive.Long.write(secretChat.accessHash));
  bytes.write(Raws.Primitive.Bool.write(secretChat.isAdmin));
  bytes.write(Raws.Primitive.Bytes.write(secretChat.authKey));
  bytes.write(Raws.Primitive.Int.write(secretChat.mtproto));
  bytes.write(Raws.Primitive.Int.write(secretChat.layer));
  bytes.write(Raws.Primitive.Int.write(secretChat.inSeqNo));
  bytes.write(Raws.Primitive.Int.write(secretChat.outSeqNo));
  bytes.write(Raws.Primitive.Int.write(secretChat.inSeqNoX));
  bytes.write(Raws.Primitive.Int.write(secretChat.outSeqNoX));
  bytes.write(Raws.Primitive.Int.write(secretChat.timeRekey));
  bytes.write(Raws.Primitive.Float.write(secretChat.created));
  bytes.write(Raws.Primitive.Float.write(secretChat.changed));
  if (secretChat.rekeyStep) {
    bytes.write(Raws.Primitive.Int.write(secretChat.rekeyStep));
  }
  if (secretChat.rekeyExchange) {
    bytes.write(Raws.Primitive.Long.write(secretChat.rekeyExchange));
  }
  if (secretChat.adminId) {
    bytes.write(Raws.Primitive.Long.write(secretChat.adminId));
  }
  if (secretChat.ttl) {
    bytes.write(Raws.Primitive.Int.write(secretChat.ttl));
  }
  return bytes.buffer;
}
export async function buildSecretChatFromBytes(bytes: Buffer): Promise<Storages.SecretChat> {
  let b = new Raws.BytesIO(bytes);
  let flags = await Raws.Primitive.Int.read(b);
  const id = await Raws.Primitive.Int.read(b);
  const accessHash = await Raws.Primitive.Long.read(b);
  const isAdmin = await Raws.Primitive.Bool.read(b);
  const authKey = await Raws.Primitive.Bytes.read(b);
  let secretChat = new Storages.SecretChat({
    id,
    accessHash,
    isAdmin,
    authKey,
  });
  secretChat.mtproto = await Raws.Primitive.Int.read(b);
  secretChat.layer = await Raws.Primitive.Int.read(b);
  secretChat.inSeqNo = await Raws.Primitive.Int.read(b);
  secretChat.outSeqNo = await Raws.Primitive.Int.read(b);
  secretChat.inSeqNoX = await Raws.Primitive.Int.read(b);
  secretChat.outSeqNoX = await Raws.Primitive.Int.read(b);
  secretChat.timeRekey = await Raws.Primitive.Int.read(b);
  secretChat.created = await Raws.Primitive.Float.read(b);
  secretChat.changed = await Raws.Primitive.Float.read(b);
  if (flags & (1 << 3)) {
    secretChat.rekeyStep = await Raws.Primitive.Int.read(b);
  }
  if (flags & (1 << 4)) {
    secretChat.rekeyExchange = await Raws.Primitive.Long.read(b);
  }
  if (flags & (1 << 5)) {
    secretChat.adminId = await Raws.Primitive.Long.read(b);
  }
  if (flags & (1 << 6)) {
    secretChat.ttl = await Raws.Primitive.Int.read(b);
  }
  return secretChat;
}
