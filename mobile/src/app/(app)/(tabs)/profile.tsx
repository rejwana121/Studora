import Constants from 'expo-constants';
import { router, type Href } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { updateProfile } from '@/api/profile';
import { Avatar } from '@/components/avatar';
import { Banner } from '@/components/banner';
import { Button } from '@/components/button';
import { Icon } from '@/components/icon';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { requestPasswordReset, signOut } from '@/features/auth/auth-service';
import { useSession } from '@/features/auth/session-context';
import { useNotificationCoordinator } from '@/features/notifications/notification-coordinator';
import { captureAvatarWithCamera, pickAvatarFromLibrary, type AvatarPickResult } from '@/features/profile/avatar-picker';
import { avatarPathFor, removeAvatar, uploadAvatar } from '@/features/profile/avatar-storage';
import { ChangePhotoSheet } from '@/features/profile/change-photo-sheet';
import { color, radius, space, touchTarget, type as typeTokens } from '@/design-system/tokens';

const APP_VERSION = Constants.expoConfig?.version ?? '1.0.0';
const AVATAR_SIZE = 100;
const CAMERA_BADGE_SIZE = 30;
const ROW_ICON_BADGE_SIZE = 38;
const ROW_MIN_HEIGHT = 54;
/** Gap between the header's own bottom padding and the avatar's top edge —
 * kept separate from AVATAR_SIZE/2 in headerSurface.paddingBottom so the
 * avatar never collides with the "Profile" title above it. */
const HEADER_AVATAR_CLEARANCE = space.xs;

export default function ProfileScreen() {
  const { session, profile, isProfileLoading, profileError, avatarSignedUrl, applyProfile, refreshAvatarSignedUrl } =
    useSession();
  const { permissionStatus, requestPermission } = useNotificationCoordinator();

  const [isEditing, setIsEditing] = useState(false);

  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isRequestingNotifications, setIsRequestingNotifications] = useState(false);
  const [notificationsError, setNotificationsError] = useState<string | null>(null);
  const [isSendingReset, setIsSendingReset] = useState(false);
  const [resetFeedback, setResetFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null
  );

  const [nameDraft, setNameDraft] = useState('');
  const [isSavingName, setIsSavingName] = useState(false);
  const [nameSaveError, setNameSaveError] = useState<string | null>(null);

  const [isPhotoSheetVisible, setIsPhotoSheetVisible] = useState(false);
  const [isPhotoBusy, setIsPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);

  async function confirmSignOut() {
    setIsSigningOut(true);
    await signOut();
    setIsSigningOut(false);
    router.replace('/(auth)/welcome');
  }

  function handleSignOut() {
    Alert.alert('Sign out?', "You'll need to sign in again to access your Studora account.", [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', onPress: confirmSignOut },
    ]);
  }

  async function handleNotificationsPress() {
    setNotificationsError(null);
    if (permissionStatus === 'undetermined') {
      setIsRequestingNotifications(true);
      try {
        await requestPermission();
      } catch {
        setNotificationsError('Could not update notification settings.');
      }
      setIsRequestingNotifications(false);
    } else if (permissionStatus === 'denied') {
      try {
        await Linking.openSettings();
      } catch {
        setNotificationsError('Could not open Settings.');
      }
    }
  }

  async function handleResetPassword() {
    const email = session?.user.email;
    if (!email || isSendingReset) return;
    setIsSendingReset(true);
    setResetFeedback(null);
    const result = await requestPasswordReset(email);
    setIsSendingReset(false);
    setResetFeedback(
      result.ok
        ? { type: 'success', message: 'Reset link sent to your email.' }
        : { type: 'error', message: result.message ?? 'Could not send reset link.' }
    );
  }

  const email = session?.user.email ?? null;
  const initialsSource = profile?.display_name ?? email ?? 'Studora User';

  function openEdit() {
    setNameDraft(profile?.display_name ?? '');
    setNameSaveError(null);
    setIsEditing(true);
  }

  function handleCancelEdit() {
    setNameDraft(profile?.display_name ?? '');
    setNameSaveError(null);
    setIsEditing(false);
  }

  async function handleSaveName() {
    if (!session) return;
    const trimmed = nameDraft.trim();
    if (!trimmed) {
      setNameSaveError('Display name cannot be blank.');
      return;
    }
    setIsSavingName(true);
    setNameSaveError(null);
    const result = await updateProfile(session.access_token, { display_name: trimmed });
    setIsSavingName(false);
    if (result.ok) {
      applyProfile(result.data);
      setIsEditing(false);
    } else {
      setNameSaveError(result.error.message);
    }
  }

  function openPhotoSheet() {
    if (isPhotoBusy) return;
    setPhotoError(null);
    setIsPhotoSheetVisible(true);
  }

  function closePhotoSheet() {
    if (isPhotoBusy) return;
    setIsPhotoSheetVisible(false);
  }

  async function handlePickResult(result: AvatarPickResult) {
    if (result.status === 'canceled') return;
    if (result.status === 'permission-denied' || result.status === 'invalid') {
      setIsPhotoSheetVisible(false);
      setPhotoError(result.message);
      return;
    }
    setIsPhotoSheetVisible(false);
    await performUpload(result.uri, result.mimeType);
  }

  async function performUpload(localUri: string, mimeType: Parameters<typeof uploadAvatar>[2]) {
    if (!session) return;
    setIsPhotoBusy(true);
    setPhotoError(null);
    const userId = session.user.id;

    const uploadResult = await uploadAvatar(userId, localUri, mimeType);
    if (!uploadResult.ok) {
      setPhotoError(uploadResult.message || 'Could not upload photo. Please try again.');
      setIsPhotoBusy(false);
      return;
    }

    const patchResult = await updateProfile(session.access_token, { avatar_path: avatarPathFor(userId) });
    if (!patchResult.ok) {
      setPhotoError('Your photo uploaded, but saving it to your profile failed. Please try again.');
      setIsPhotoBusy(false);
      return;
    }

    applyProfile(patchResult.data);
    await refreshAvatarSignedUrl();
    setIsPhotoBusy(false);
  }

  async function handleRemovePhoto() {
    if (!session) return;
    setIsPhotoBusy(true);
    setPhotoError(null);
    const userId = session.user.id;

    const removeResult = await removeAvatar(userId);
    if (!removeResult.ok) {
      setPhotoError(removeResult.message || 'Could not remove photo. Please try again.');
      setIsPhotoBusy(false);
      return;
    }

    const patchResult = await updateProfile(session.access_token, { avatar_path: null });
    if (!patchResult.ok) {
      setPhotoError('Your photo was removed, but saving that to your profile failed. Please try again.');
      setIsPhotoBusy(false);
      return;
    }

    applyProfile(patchResult.data);
    setIsPhotoSheetVisible(false);
    setIsPhotoBusy(false);
  }

  const notificationsActionable = permissionStatus === 'undetermined' || permissionStatus === 'denied';
  const notificationsLabel = isRequestingNotifications
    ? '…'
    : permissionStatus === 'granted'
      ? 'On'
      : permissionStatus === 'denied'
        ? 'Off — Open Settings'
        : permissionStatus === 'undetermined'
          ? 'Enable'
          : '…';

  const avatarBlock = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Change profile photo"
      accessibilityState={{ disabled: isPhotoBusy }}
      onPress={openPhotoSheet}
      disabled={isPhotoBusy}
      style={styles.avatarWrap}
    >
      <Avatar uri={avatarSignedUrl} label={initialsSource} size={AVATAR_SIZE} shape="circle" />
      <View style={styles.cameraBadge}>
        {isPhotoBusy ? (
          <ActivityIndicator size="small" color={color.text.onFill} />
        ) : (
          <Icon name="camera" size="sm" color={color.text.onFill} />
        )}
      </View>
    </Pressable>
  );

  return (
    <SafeAreaView style={styles.outerSafeArea}>
      <View style={styles.headerSurface}>
        {isEditing ? (
          <View style={styles.editTopBar}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Back"
              onPress={handleCancelEdit}
              disabled={isSavingName}
              style={styles.backButton}
            >
              <Icon name="chevron-back" size="lg" color={color.text.primary} />
            </Pressable>
            <ThemedText type="default" style={styles.headerTitle}>
              Edit Profile
            </ThemedText>
            <View style={styles.backButton} />
          </View>
        ) : (
          <ThemedText type="default" style={styles.headerTitle}>
            Profile
          </ThemedText>
        )}
      </View>

      {isProfileLoading && !profile && <ActivityIndicator style={styles.loading} color={color.primary.violet} />}
      {!isProfileLoading && profileError && !profile && (
        <Banner variant="error" message={profileError} />
      )}

      {/* Fixed (non-scrolling) identity zone — overlaps the header's rounded
       * bottom edge via negative margin, same technique Today's hero card
       * uses. Deliberately a sibling of the ScrollView below, not its first
       * child: a negative margin on a ScrollView's own content gets clipped
       * at the scroll boundary instead of overlapping anything. */}
      {profile && !isEditing && (
        <View style={styles.identityBlock}>
          {avatarBlock}
          <ThemedText type="default" style={styles.displayName} numberOfLines={1}>
            {profile.display_name ?? email ?? 'Studora User'}
          </ThemedText>
          {email && (
            <ThemedText type="default" style={styles.email} numberOfLines={1}>
              {email}
            </ThemedText>
          )}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Edit Profile"
            onPress={openEdit}
            style={({ pressed }) => [styles.editProfileButton, pressed && styles.pressed]}
          >
            <Icon name="create-outline" size="sm" color={color.text.onFill} />
            <ThemedText type="default" style={styles.editProfileLabel}>
              Edit Profile
            </ThemedText>
          </Pressable>
        </View>
      )}

      {profile && isEditing && (
        <View style={styles.identityBlock}>
          {avatarBlock}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Change photo"
            onPress={openPhotoSheet}
            disabled={isPhotoBusy}
          >
            <ThemedText type="default" style={styles.changePhotoLink}>
              Change photo
            </ThemedText>
          </Pressable>
        </View>
      )}

      {profile && !isEditing && (
        <ScrollView
          style={styles.scrollFlex}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          <View style={styles.group}>
            <ThemedText type="default" style={styles.groupLabel}>
              Academic
            </ThemedText>
            <View style={styles.divider} />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Manage Subjects"
              onPress={() => router.push('/profile/subjects' as Href)}
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            >
              <RowIcon name="book-outline" />
              <ThemedText type="default" style={styles.rowLabel}>
                Manage Subjects
              </ThemedText>
              <Icon name="chevron-forward" size="sm" color={color.text.secondary} />
            </Pressable>
          </View>

          <View style={styles.group}>
            <ThemedText type="default" style={styles.groupLabel}>
              Preferences
            </ThemedText>
            <View style={styles.divider} />
            <View style={styles.row}>
              <RowIcon name="globe-outline" />
              <ThemedText type="default" style={styles.rowLabel}>
                Timezone
              </ThemedText>
              <ThemedText type="default" style={styles.rowValue} numberOfLines={1}>
                {profile.timezone}
              </ThemedText>
            </View>
            <View style={styles.divider} />
            {notificationsActionable ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Notifications: ${notificationsLabel}`}
                onPress={handleNotificationsPress}
                disabled={isRequestingNotifications}
                style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
              >
                <RowIcon name="notifications-outline" />
                <ThemedText type="default" style={styles.rowLabel}>
                  Notifications
                </ThemedText>
                <ThemedText type="default" style={[styles.rowValue, styles.rowValueAction]} numberOfLines={1}>
                  {notificationsLabel}
                </ThemedText>
                <Icon name="chevron-forward" size="sm" color={color.text.secondary} />
              </Pressable>
            ) : (
              <View style={styles.row}>
                <RowIcon name="notifications-outline" />
                <ThemedText type="default" style={styles.rowLabel}>
                  Notifications
                </ThemedText>
                <ThemedText type="default" style={styles.rowValue} numberOfLines={1}>
                  {notificationsLabel}
                </ThemedText>
              </View>
            )}
            {notificationsError && (
              <ThemedText type="default" style={styles.inlineError}>
                {notificationsError}
              </ThemedText>
            )}
          </View>

          <View style={styles.group}>
            <ThemedText type="default" style={styles.groupLabel}>
              Security
            </ThemedText>
            <View style={styles.divider} />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Reset Password"
              onPress={handleResetPassword}
              disabled={isSendingReset}
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            >
              <RowIcon name="lock-closed-outline" />
              <ThemedText type="default" style={styles.rowLabel}>
                {isSendingReset ? 'Sending…' : 'Reset Password'}
              </ThemedText>
            </Pressable>
            {resetFeedback && (
              <ThemedText
                type="default"
                style={resetFeedback.type === 'success' ? styles.inlineSuccess : styles.inlineError}
              >
                {resetFeedback.message}
              </ThemedText>
            )}
            <View style={styles.divider} />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Sign Out"
              onPress={handleSignOut}
              disabled={isSigningOut}
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            >
              <RowIcon name="log-out-outline" tone="coral" />
              <ThemedText type="default" style={styles.signOutLabel}>
                {isSigningOut ? 'Signing out…' : 'Sign Out'}
              </ThemedText>
              <Icon name="chevron-forward" size="sm" color={color.risk.high.text} />
            </Pressable>
          </View>

          <ThemedText type="default" style={styles.footer}>
            Studora v{APP_VERSION}
          </ThemedText>
        </ScrollView>
      )}

      {profile && isEditing && (
        <KeyboardAvoidingView
          style={styles.editFlex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
        >
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.editScrollContent}
            keyboardShouldPersistTaps="handled"
          >
            {photoError && <Banner variant="error" message={photoError} />}

            <View style={styles.formGroup}>
              <TextField
                label="Display name"
                value={nameDraft}
                onChangeText={setNameDraft}
                editable={!isSavingName}
                autoCapitalize="words"
                returnKeyType="done"
              />

              <ReadOnlyField label="Email" value={email ?? '—'} />
              <ReadOnlyField label="Timezone" value={profile.timezone} icon="globe-outline" />
            </View>

            {nameSaveError && <Banner variant="error" message={nameSaveError} />}

            <View style={styles.saveCancelStack}>
              <Button label="Save Changes" onPress={handleSaveName} loading={isSavingName} />
              <Button label="Cancel" variant="text" onPress={handleCancelEdit} disabled={isSavingName} />
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      )}

      <ChangePhotoSheet
        visible={isPhotoSheetVisible}
        hasPhoto={!!profile?.avatar_path}
        isBusy={isPhotoBusy}
        onChooseFromLibrary={() => pickAvatarFromLibrary().then(handlePickResult)}
        onTakePhoto={() => captureAvatarWithCamera().then(handlePickResult)}
        onRemovePhoto={handleRemovePhoto}
        onCancel={closePhotoSheet}
      />
    </SafeAreaView>
  );
}

function RowIcon({ name, tone = 'violet' }: { name: React.ComponentProps<typeof Icon>['name']; tone?: 'violet' | 'coral' }) {
  const isCoral = tone === 'coral';
  return (
    <View style={[styles.rowIconBadge, { backgroundColor: isCoral ? color.risk.high.bg : color.accent.lavender }]}>
      <Icon name={name} size="md" color={isCoral ? color.risk.high.text : color.primary.violet} />
    </View>
  );
}

function ReadOnlyField({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  /** Leading glyph — mirrors the reference's field icons (e.g. Timezone's
   * globe). Omit for fields the reference shows unadorned (e.g. Email). */
  icon?: React.ComponentProps<typeof Icon>['name'];
}) {
  return (
    <View style={styles.readOnlyRow} accessibilityLabel={`${label}, ${value}, read only`}>
      <ThemedText type="default" style={styles.readOnlyLabel}>
        {label}
      </ThemedText>
      <View style={styles.readOnlyValueWrap}>
        {!!icon && <Icon name={icon} size="sm" color={color.primary.violet} />}
        <ThemedText type="default" style={styles.readOnlyValue} numberOfLines={1}>
          {value}
        </ThemedText>
        <Icon name="lock-closed-outline" size="sm" color={color.text.secondary} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outerSafeArea: {
    flex: 1,
    backgroundColor: color.surface.canvas,
  },
  headerSurface: {
    backgroundColor: color.surface.profileHeader,
    paddingTop: space.sm,
    // Must clear the avatar's negative-margin overlap (identityBlock pulls
    // up by AVATAR_SIZE/2) plus a small gap below the title, or the
    // avatar's top edge collides with the "Profile" text.
    paddingBottom: AVATAR_SIZE / 2 + HEADER_AVATAR_CLEARANCE,
    borderBottomLeftRadius: radius.card,
    borderBottomRightRadius: radius.card,
  },
  headerTitle: {
    fontSize: typeTokens.heading.fontSize,
    lineHeight: typeTokens.heading.lineHeight,
    fontWeight: '700',
    color: color.text.primary,
    textAlign: 'center',
  },
  editTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.sm,
  },
  backButton: {
    width: touchTarget.min,
    height: touchTarget.min,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loading: {
    marginTop: space.lg,
  },
  scrollFlex: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: space.lg,
    paddingBottom: space.xl,
  },
  editFlex: {
    flex: 1,
  },
  editScrollContent: {
    paddingHorizontal: space.lg,
    paddingBottom: space.xl,
    gap: space.md,
  },
  identityBlock: {
    alignItems: 'center',
    marginTop: -AVATAR_SIZE / 2,
    marginBottom: space.sm,
    gap: space.xs,
  },
  avatarWrap: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    marginBottom: space.xs,
  },
  cameraBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: CAMERA_BADGE_SIZE,
    height: CAMERA_BADGE_SIZE,
    borderRadius: radius.pill,
    backgroundColor: color.primary.violet,
    borderWidth: 2,
    borderColor: color.surface.canvas,
    alignItems: 'center',
    justifyContent: 'center',
  },
  displayName: {
    fontSize: typeTokens.heading.fontSize,
    lineHeight: typeTokens.heading.lineHeight,
    fontWeight: '700',
    color: color.text.primary,
  },
  email: {
    fontSize: typeTokens.body.fontSize,
    color: color.text.secondary,
  },
  changePhotoLink: {
    fontSize: typeTokens.body.fontSize,
    fontWeight: '600',
    color: color.primary.violet,
  },
  editProfileButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    minHeight: touchTarget.min,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    backgroundColor: color.primary.violet,
  },
  editProfileLabel: {
    fontSize: typeTokens.body.fontSize,
    fontWeight: '600',
    color: color.text.onFill,
  },
  pressed: {
    opacity: 0.85,
  },
  formGroup: {
    gap: space.md,
  },
  readOnlyRow: {
    gap: space.xs,
  },
  readOnlyLabel: {
    fontSize: typeTokens.label.fontSize,
    lineHeight: typeTokens.label.lineHeight,
    fontWeight: typeTokens.label.fontWeight,
    color: color.text.secondary,
  },
  readOnlyValueWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: touchTarget.min,
    borderRadius: radius.control,
    borderWidth: 1.5,
    borderColor: color.border.divider,
    backgroundColor: color.background.card,
    paddingHorizontal: space.md,
    gap: space.sm,
  },
  readOnlyValue: {
    flex: 1,
    fontSize: typeTokens.body.fontSize,
    color: color.text.secondary,
  },
  saveCancelStack: {
    gap: space.xs,
    marginTop: space.xs,
  },
  groupLabel: {
    fontSize: typeTokens.label.fontSize,
    fontWeight: '600',
    color: color.text.secondary,
    paddingHorizontal: space.md,
    paddingTop: space.sm,
    paddingBottom: space.xs,
  },
  // Border only, deliberately no shadow: `overflow: 'hidden'` (needed to
  // clip row dividers/press states to the rounded corners) would clip an
  // iOS shadow along with them (see Avatar's two-layer shadow+clip split),
  // and duplicating that split here for a "restrained" card reads as
  // overbuilt — one consistent border treatment across all three groups is
  // enough.
  group: {
    backgroundColor: color.background.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: color.border.divider,
    overflow: 'hidden',
    marginBottom: space.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: ROW_MIN_HEIGHT,
    paddingHorizontal: space.md,
    gap: space.sm,
  },
  rowPressed: {
    opacity: 0.7,
  },
  rowIconBadge: {
    width: ROW_ICON_BADGE_SIZE,
    height: ROW_ICON_BADGE_SIZE,
    borderRadius: ROW_ICON_BADGE_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  divider: {
    height: 1,
    backgroundColor: color.border.divider,
    marginHorizontal: space.md,
  },
  rowLabel: {
    flex: 1,
    fontSize: typeTokens.body.fontSize,
    color: color.text.primary,
  },
  rowValue: {
    fontSize: typeTokens.body.fontSize,
    color: color.text.secondary,
  },
  rowValueAction: {
    color: color.primary.violet,
    fontWeight: '600',
  },
  signOutLabel: {
    flex: 1,
    fontSize: typeTokens.body.fontSize,
    fontWeight: '600',
    color: color.risk.high.text,
  },
  inlineError: {
    fontSize: typeTokens.caption.fontSize,
    color: color.risk.high.text,
    paddingHorizontal: space.md,
    paddingBottom: space.sm,
  },
  inlineSuccess: {
    fontSize: typeTokens.caption.fontSize,
    color: color.text.secondary,
    paddingHorizontal: space.md,
    paddingBottom: space.sm,
  },
  footer: {
    fontSize: typeTokens.caption.fontSize,
    color: color.text.secondary,
    textAlign: 'center',
    marginTop: space.sm,
    marginBottom: space.sm,
  },
});
