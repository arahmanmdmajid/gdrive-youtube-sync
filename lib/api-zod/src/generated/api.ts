import * as zod from 'zod';


/**
 * @summary Health check
 */
export const HealthCheckResponse = zod.object({
  "status": zod.string()
})


/**
 * @summary List all pipeline jobs
 */
export const ListJobsQueryParams = zod.object({
  "status": zod.enum(['needs_review', 'pending', 'processing', 'done', 'failed', 'rejected', 'removed']).optional()
})


/**
 * @summary Enqueue a Drive video for YouTube upload
 */
export const CreateJobBody = zod.object({
  "driveFileId": zod.string(),
  "driveFileName": zod.string(),
  "driveFileSizeBytes": zod.number().nullish(),
  "driveCreatedTime": zod.string().nullish()
})


/**
 * @summary Edit proposed title/description of a needs_review or pending job
 */
export const PatchJobBody = zod.object({
  "lectureName": zod.string().optional(),
  "proposedTitle": zod.string().optional(),
  "proposedDescription": zod.string().optional(),
  "conflictResolution": zod.enum(["swap", "merge"]).optional(),
})


/**
 * @summary Rename the YouTube title of a done job
 */
export const RenameYoutubeTitleBody = zod.object({
  "title": zod.string().min(1),
})


/**
 * @summary Approve a needs_review job (optionally update title/description) and move to pending
 */
export const ApproveJobBody = zod.object({
  "lectureName": zod.string().optional(),
  "proposedTitle": zod.string().optional(),
  "proposedDescription": zod.string().optional(),
  "conflictResolution": zod.enum(["swap", "merge"]).optional(),
})


/**
 * @summary Update pipeline settings
 */
export const UpdateSettingsBody = zod.object({
  "youtubePlaylistId": zod.string().nullish(),
  "youtubePlaylistName": zod.string().nullish(),
  "libraryFolderId": zod.string().nullish(),
  "libraryFolderName": zod.string().nullish(),
  "audioFolderId": zod.string().nullish(),
  "audioFolderName": zod.string().nullish(),
  "autoSync": zod.boolean().optional(),
  "syncIntervalMinutes": zod.number().optional()
})


/**
 * @summary List catalogued library resources
 */
export const ListLibraryResourcesQueryParams = zod.object({
  "category": zod.string().optional()
})


export const PatchLibraryResourceParams = zod.object({
  "id": zod.coerce.number()
})

export const PatchLibraryResourceBody = zod.object({
  "title": zod.string().min(1).optional(),
  "category": zod.string().min(1).optional(),
  "visible": zod.boolean().optional()
})


/**
 * @summary Remove a library resource's catalog entry (does not touch the Drive file)
 */
export const DeleteLibraryResourceParams = zod.object({
  "id": zod.coerce.number()
})
