const { v2: cloudinary } = require('cloudinary');

const configured = () =>
  Boolean(
    process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET
  );

const configure = () =>
  cloudinary.config({
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

/**
 * Sube una imagen ya validada. Cloudinary acepta directamente un data URI.
 * Las fotos de marcación son privadas: no deben quedar indexadas ni ser
 * adivinables, así que el public_id incluye el identificador de la sesión.
 */
const uploadImage = async (dataUri, publicId) => {
  if (!configured()) throw new Error('Cloudinary no está configurado');
  configure();

  const result = await cloudinary.uploader.upload(dataUri, {
    resource_type: 'image',
    type: 'upload',
    public_id: publicId,
    overwrite: true,
    invalidate: true,
    use_filename: false,
    // Reduce el peso sin perder la cara de la persona.
    transformation: [{ width: 1080, height: 1080, crop: 'limit', quality: 'auto:good' }],
  });

  return { url: result.secure_url, publicId: result.public_id };
};

module.exports = { configured, uploadPdf, uploadImage };
