import { Link, router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { updateProfile } from '@/api/profile';
import { AuthShell } from '@/components/auth-shell';
import { Banner } from '@/components/banner';
import { Button } from '@/components/button';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { signUp } from '@/features/auth/auth-service';
import { color, space, type as typeTokens } from '@/design-system/tokens';

const MIN_PASSWORD_LENGTH = 8;

export default function SignUpScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{
    email?: string;
    password?: string;
    confirmPassword?: string;
  }>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit() {
    setServerError(null);
    setInfoMessage(null);

    const errors: typeof fieldErrors = {};
    if (!email.trim()) errors.email = 'Email is required';
    if (password.length < MIN_PASSWORD_LENGTH) {
      errors.password = `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
    }
    if (confirmPassword !== password) errors.confirmPassword = 'Passwords do not match';
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setIsSubmitting(true);
    const result = await signUp(email.trim(), password);

    if (!result.ok) {
      setIsSubmitting(false);
      setServerError(result.message ?? 'Sign up failed. Please try again.');
      return;
    }

    if (!result.session) {
      // Email confirmation is required by the Supabase project before a
      // session is issued — no profile can be created/timezone-tagged yet.
      setIsSubmitting(false);
      setInfoMessage('Account created. Check your email to confirm, then sign in.');
      return;
    }

    const deviceTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    await updateProfile(result.session.access_token, { timezone: deviceTimezone });

    setIsSubmitting(false);
    router.replace('/(app)/(tabs)');
  }

  return (
    <AuthShell
      heroSource={require('../../../assets/images/studora-sign-up-hero-opt.jpg')}
      variant="signUp"
      title="Create your account"
      subtitle="Start planning university life with less stress."
    >
      {serverError && (
        <View style={styles.bannerWrap}>
          <Banner variant="error" message={serverError} />
        </View>
      )}
      {infoMessage && (
        <View style={styles.bannerWrap}>
          <Banner variant="success" message={infoMessage} />
        </View>
      )}

      <View style={styles.form}>
        <TextField
          label="Email"
          value={email}
          onChangeText={setEmail}
          error={fieldErrors.email}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          icon="mail-outline"
          density="auth"
        />
        <TextField
          label="Password"
          value={password}
          onChangeText={setPassword}
          error={fieldErrors.password}
          secureTextEntry
          autoComplete="new-password"
          icon="lock-closed-outline"
          showPasswordToggle
          density="auth"
        />
        <TextField
          label="Confirm password"
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          error={fieldErrors.confirmPassword}
          secureTextEntry
          autoComplete="new-password"
          icon="shield-checkmark-outline"
          showPasswordToggle
          density="auth"
        />
      </View>

      <View style={styles.buttonWrap}>
        <Button label="Create Account" onPress={handleSubmit} loading={isSubmitting} />
      </View>

      <Link href="/(auth)/sign-in" style={styles.link}>
        <ThemedText type="default" style={styles.linkText}>
          Already have an account? Sign in
        </ThemedText>
      </Link>
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  bannerWrap: {
    marginBottom: space.sm,
  },
  form: {
    gap: 11,
  },
  buttonWrap: {
    marginTop: 16,
  },
  link: {
    alignSelf: 'center',
    paddingVertical: space.sm,
    marginTop: 10,
  },
  linkText: {
    color: color.primary.violet,
    fontSize: typeTokens.label.fontSize,
  },
});
