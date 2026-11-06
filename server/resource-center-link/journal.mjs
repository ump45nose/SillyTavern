import fs from "node:fs";
import path from "node:path";
import { randomBytes, createCipheriv, createDecipheriv } from "node:crypto";

const stamp = () => new Date().toISOString().replace(/[:.]/g, "-");

/** One encrypted journal per native user. Network retries never need to read chat files. */
export class Journal {
  constructor(root) {
    this.dir = path.join(root, "resource-center-link");
    this.file = path.join(this.dir, "state.enc");
    const key = path.join(this.dir, "vault.key");
    if (fs.existsSync(key)) this.key = fs.readFileSync(key);
    this.state = {
      config: null,
      mappings: {},
      observed: {},
      queue: [],
      calls: {},
      problems: {},
      localRevision: 0,
    };
    if (fs.existsSync(this.file)) {
      const data = fs.readFileSync(this.file);
      try {
        if (!this.key) throw new Error("资源中心日志的配套密钥缺失");
        const d = createDecipheriv("aes-256-gcm", this.key, data.subarray(0, 12));
        d.setAuthTag(data.subarray(12, 28));
        this.state = {
          ...this.state,
          ...JSON.parse(Buffer.concat([d.update(data.subarray(28)), d.final()]).toString()),
        };
      } catch (e) {
        // A journal that cannot be decrypted is kept aside for inspection; the user pairs again.
        this.problem = String(e?.message || e);
        this.quarantined = `${this.file}.corrupt-${stamp()}`;
        fs.renameSync(this.file, this.quarantined);
      }
    }
    // A key of any other size cannot encrypt new state either, and save() never overwrites a key file.
    if (this.key && this.key.length !== 32) {
      fs.renameSync(key, `${key}.corrupt-${stamp()}`);
      this.key = undefined;
    }
  }
  save() {
    fs.mkdirSync(this.dir, { recursive: true, mode: 0o700 });
    if (!this.key) {
      this.key = randomBytes(32);
      fs.writeFileSync(path.join(this.dir, "vault.key"), this.key, { mode: 0o600, flag: "wx" });
    }
    const nonce = randomBytes(12),
      cipher = createCipheriv("aes-256-gcm", this.key, nonce);
    const body = Buffer.concat([cipher.update(JSON.stringify(this.state)), cipher.final()]);
    const tmp = this.file + ".next";
    fs.writeFileSync(tmp, Buffer.concat([nonce, cipher.getAuthTag(), body]), { mode: 0o600 });
    fs.renameSync(tmp, this.file);
  }
}
