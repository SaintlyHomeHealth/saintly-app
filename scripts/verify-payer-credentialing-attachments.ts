/**
 * Lightweight assertions for credentialing attachment batching/dedup helpers.
 * Run: npx tsx scripts/verify-payer-credentialing-attachments.ts
 */

import assert from "node:assert/strict";

import {
  attachmentFallbackKey,
  batchItemsByTotalSize,
  computeAttachmentSha256,
  isDuplicateAgainstExisting,
  maxCredentialingClientUploadBatchBytes,
  PAYER_CREDENTIALING_API_MAX_BATCH_BYTES,
} from "../src/lib/crm/payer-credentialing-attachments";

function testSha256() {
  const hash = computeAttachmentSha256(Buffer.from("hello credentialing"));
  assert.equal(hash.length, 64);
  assert.equal(hash, computeAttachmentSha256(Buffer.from("hello credentialing")));
}

function testBatching() {
  const max = maxCredentialingClientUploadBatchBytes();
  assert.equal(max, PAYER_CREDENTIALING_API_MAX_BATCH_BYTES);

  const small = Array.from({ length: 13 }, (_, i) => ({ size: 512 * 1024, id: i }));
  const batches = batchItemsByTotalSize(small, max);
  assert.equal(batches.length, 1, "13 half-MB files should fit in one 20MB batch");

  const singleFileBatches = small.flatMap((item) => [item]);
  assert.equal(singleFileBatches.length, 13, "one-file-per-request yields 13 batches");

  const large = [
    { size: 9 * 1024 * 1024, id: "a" },
    { size: 9 * 1024 * 1024, id: "b" },
    { size: 9 * 1024 * 1024, id: "c" },
  ];
  const largeBatches = batchItemsByTotalSize(large, max);
  assert.ok(largeBatches.length >= 2, "27 MB total should split into multiple batches");
  for (const batch of largeBatches) {
    const total = batch.reduce((sum, item) => sum + item.size, 0);
    assert.ok(total <= max || batch.length === 1, "each batch should respect size limit");
  }
}

function testDuplicateDetection() {
  const hash = computeAttachmentSha256(Buffer.from("same-bytes"));
  const existing = [
    {
      fileHashSha256: hash,
      fileName: "contract.pdf",
      fileSize: 100,
      fileType: "application/pdf",
    },
  ];

  assert.ok(
    isDuplicateAgainstExisting({
      hash,
      fileName: "renamed.pdf",
      fileSize: 200,
      fileType: "application/pdf",
      existing,
    })
  );

  assert.ok(
    !isDuplicateAgainstExisting({
      hash: computeAttachmentSha256(Buffer.from("other-bytes")),
      fileName: "new.pdf",
      fileSize: 100,
      fileType: "application/pdf",
      existing,
    })
  );

  const legacy = [
    {
      fileHashSha256: null,
      fileName: "legacy.pdf",
      fileSize: 555,
      fileType: "application/pdf",
    },
  ];
  const legacyKey = attachmentFallbackKey({
    fileName: "legacy.pdf",
    fileSize: 555,
    fileType: "application/pdf",
  });
  assert.equal(
    legacyKey,
    attachmentFallbackKey({ fileName: "legacy.pdf", fileSize: 555, fileType: "application/pdf" })
  );
  assert.ok(
    isDuplicateAgainstExisting({
      hash: computeAttachmentSha256(Buffer.from("different-content")),
      fileName: "legacy.pdf",
      fileSize: 555,
      fileType: "application/pdf",
      existing: legacy,
    })
  );
}

function main() {
  testSha256();
  testBatching();
  testDuplicateDetection();
  console.log("verify-payer-credentialing-attachments: ok");
}

main();
