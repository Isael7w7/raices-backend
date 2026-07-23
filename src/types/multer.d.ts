/**
 * Manual augmentation of the Express namespace for Multer types.
 *
 * @types/multer@2.x attempts to augment the global Express namespace,
 * but this breaks when @types/express@5.x changes its internal structure.
 * This file provides a stable declaration so `Express.Multer.File` works.
 */
declare namespace Express {
  namespace Multer {
    interface File {
      /** Name of the form field associated with this file */
      fieldname: string;
      /** Name of the file on the user's computer */
      originalname: string;
      /** Encoding type of the file */
      encoding: string;
      /** MIME type of the file */
      mimetype: string;
      /** Size of the file in bytes */
      size: number;
      /** `DiskStorage`: The folder to which the file has been saved */
      destination?: string;
      /** `DiskStorage`: The name of the file within the upload folder */
      filename?: string;
      /** `DiskStorage`: The full path to the uploaded file */
      path?: string;
      /** `MemoryStorage`: A Buffer containing the entire file */
      buffer: Buffer;
    }
  }
}
