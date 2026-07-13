const { v2: cloudinary } = require('cloudinary');

const configured = () => Boolean(
  process.env.CLOUDINARY_CLOUD_NAME &&
  process.env.CLOUDINARY_API_KEY &&
  process.env.CLOUDINARY_API_SECRET
);

const configure = () => cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

const uploadPdf = async (filePath, publicId) => {
  if (!configured()) throw new Error('Cloudinary no está configurado');
  configure();
  const result = await cloudinary.uploader.upload(filePath, {
    resource_type: 'raw',
    type: 'upload',
    public_id: publicId,
    overwrite: true,
    invalidate: true,
    use_filename: false,
  });
  return { url: result.secure_url, publicId: result.public_id };
};

module.exports = { configured, uploadPdf };
