import * as ImagePicker from 'expo-image-picker';

import { AVATAR_MAX_BYTES, isAllowedAvatarMimeType, isAvatarFileTooLarge, type AllowedMimeType } from './avatar-storage';

export type AvatarPickResult =
  | { status: 'selected'; uri: string; mimeType: AllowedMimeType }
  | { status: 'canceled' }
  | { status: 'permission-denied'; message: string }
  | { status: 'invalid'; message: string };

const PICKER_OPTIONS: ImagePicker.ImagePickerOptions = {
  mediaTypes: ['images'],
  allowsEditing: true,
  aspect: [1, 1],
  quality: 0.9,
};

function validateAsset(asset: ImagePicker.ImagePickerAsset): AvatarPickResult {
  if (!isAllowedAvatarMimeType(asset.mimeType)) {
    return { status: 'invalid', message: 'Please choose a JPEG, PNG, or WEBP image.' };
  }
  if (isAvatarFileTooLarge(asset.fileSize)) {
    return { status: 'invalid', message: `That photo is larger than ${AVATAR_MAX_BYTES / (1024 * 1024)} MB. Choose a smaller one.` };
  }
  return { status: 'selected', uri: asset.uri, mimeType: asset.mimeType };
}

/** `requestXAsync` only re-prompts the system dialog while the OS still
 * considers the permission askable (`canAskAgain`). On iOS in particular,
 * the system dialog is shown at most once ever per permission — after an
 * explicit deny, `canAskAgain` is `false` and every subsequent
 * `requestXAsync` call resolves `denied` immediately with no dialog, so a
 * "try again" message would be actively misleading. Once `canAskAgain` is
 * false, the only way to grant access is the device Settings app. */
function permissionDeniedMessage(canAskAgain: boolean, subject: 'photos' | 'camera'): string {
  const need = subject === 'photos' ? 'access to your photos' : 'camera access';
  if (canAskAgain) {
    return `Studora needs ${need} to set a profile picture.`;
  }
  return `${subject === 'photos' ? 'Photo' : 'Camera'} access is turned off for Studora. Enable it in your device's Settings app to set a profile picture.`;
}

/** Requests media-library permission only when this action is actually
 * chosen (never eagerly on screen load). */
export async function pickAvatarFromLibrary(): Promise<AvatarPickResult> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    return { status: 'permission-denied', message: permissionDeniedMessage(permission.canAskAgain, 'photos') };
  }

  const result = await ImagePicker.launchImageLibraryAsync(PICKER_OPTIONS);
  if (result.canceled || result.assets.length === 0) return { status: 'canceled' };
  return validateAsset(result.assets[0]);
}

/** Requests camera permission only when this action is actually chosen. */
export async function captureAvatarWithCamera(): Promise<AvatarPickResult> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) {
    return { status: 'permission-denied', message: permissionDeniedMessage(permission.canAskAgain, 'camera') };
  }

  const result = await ImagePicker.launchCameraAsync(PICKER_OPTIONS);
  if (result.canceled || result.assets.length === 0) return { status: 'canceled' };
  return validateAsset(result.assets[0]);
}
