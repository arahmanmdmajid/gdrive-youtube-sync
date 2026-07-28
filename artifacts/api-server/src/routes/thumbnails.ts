import { Router } from "express";
import multer from "multer";
import {
  listKnownSubjectSerials,
  getSubjectThumbnailPath,
  saveSubjectThumbnail,
  deleteSubjectThumbnail,
} from "../lib/thumbnails";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === "image/jpeg" || file.mimetype === "image/png") {
      cb(null, true);
    } else {
      cb(new Error("Only JPEG and PNG images are supported"));
    }
  },
});

const router = Router();

function imageUrlFor(serial: string): string | null {
  const p = getSubjectThumbnailPath(serial);
  return p ? `/api/thumbnail-files/${serial}${p.slice(p.lastIndexOf("."))}` : null;
}

router.get("/thumbnails/subjects", async (_req, res) => {
  const subjects = await listKnownSubjectSerials();
  res.json(
    subjects.map(({ serial, label }) => ({
      serial,
      label,
      imageUrl: imageUrlFor(serial),
    })),
  );
});

router.post("/thumbnails/subjects/:serial", upload.single("image"), (req, res) => {
  const serial = String(req.params.serial);
  if (!/^\d+\.\d+$/.test(serial)) {
    res.status(400).json({ error: "Invalid serial" });
    return;
  }
  if (!req.file) {
    res.status(400).json({ error: "No image uploaded" });
    return;
  }
  saveSubjectThumbnail(serial, req.file.buffer, req.file.mimetype);
  res.json({ serial, imageUrl: imageUrlFor(serial) });
});

router.delete("/thumbnails/subjects/:serial", (req, res) => {
  deleteSubjectThumbnail(String(req.params.serial));
  res.status(204).send();
});

export default router;
