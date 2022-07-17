/**
 * tgsnake - Telegram MTProto framework for nodejs.
 * Copyright (C) 2022 butthx <https://github.com/butthx>
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
      [id: bigint, accessHash: bigint, type: string, username?: string, phoneNumber?: string]
    >
  ) {
    await this._connect();
    const sessionName = `${this.sessionName}${this._sessionDelim}`;
    Logger.debug(`Updating ${peers.length} peers`);
    for (let peer of peers) {
      let bytes = await buildBytesFromPeer(peer);
      this._set(
        `${sessionName}peer${this._sessionDelim}${peer[0]}`,
        bytes.toString('hex'),
        this._peerExp
      );
    }
  }
  async getPeerById(id: bigint) {
    Logger.debug(`Getting peer by id: ${id}`);
    const sessionName = `${this.sessionName}${this._sessionDelim}`;
    let bytes = this._redisClient.get(`${sessionName}peer${this._sessionDelim}${id}`);
    if (bytes) {
      let peer = await buildPeerFromBytes(Buffer.from(bytes, 'hex'));
      return Storages.getInputPeer(peer[0], peer[1], peer[2]);
    }
  }
  async getPeerByUsername(username: string) {
    Logger.debug(`Getting peer by username: ${username}`);
    const sessionName = `${this.sessionName}${this._sessionDelim}`;
    for (let key of this._redisClient.scanIterator()) {
      if (String(key).startsWith(`${sessionName}peer`)) {
        let bytes = await this._redisClient.get(key);
        if (bytes) {
          let peer = await buildPeerFromBytes(Buffer.from(bytes, 'hex'));
          if (peer[3] && peer[3] === username) {
            return Storages.getInputPeer(peer[0], peer[1], peer[2]);
          }
        }
      }
    }
  }
  async getPeerByPhoneNumber(phoneNumber: string) {
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
  peer: [id: bigint, accessHash: bigint, type: string, username?: string, phoneNumber?: string]
): Buffer {
  let bytes = new Raws.BytesIO();
  let flags = 0;
  if (peer[3]) {
    flags |= 1 << 4;
  }
  if (peer[4]) {
    flags |= 1 << 5;
  }
  bytes.write(Raws.Primitive.Int.write(flags));
  bytes.write(Raws.Primitive.Long.write(peer[0]));
  bytes.write(Raws.Primitive.Long.write(peer[1]));
  bytes.write(Raws.Primitive.String.write(peer[2]));
  if (peer[3]) {
    bytes.write(Raws.Primitive.String.write(peer[3]));
  }
  if (peer[4]) {
    bytes.write(Raws.Primitive.String.write(peer[4]));
  }
  return bytes.buffer;
}
/**
 * Creating valid peer schema from bytes.
 * @param bytes {Buffer} - Bytes will be converted to peer schema.
 */
export function buildPeerFromBytes(
  bytes: Buffer
): [id: bigint, accessHash: bigint, type: string, username?: string, phoneNumber?: string] {
  let b = new Raws.BytesIO(bytes);
  // @ts-ignore
  let results: Array<any> = [];
  let flags = Raws.Primitive.Int.read(b);
  results.push(Raws.Primitive.Long.read(b));
  results.push(Raws.Primitive.Long.read(b));
  results.push(Raws.Primitive.String.read(b));
  if (flags & (1 << 4)) {
    results.push(Raws.Primitive.String.read(b));
  }
  if (flags & (1 << 5)) {
    results.push(Raws.Primitive.String.read(b));
  }
  return results as unknown as [
    id: bigint,
    accessHash: bigint,
    type: string,
    username?: string,
    phoneNumber?: string
  ];
}
