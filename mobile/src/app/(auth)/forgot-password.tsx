import { Link } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AuthShell } from '@/components/auth-shell';
import { Banner } from '@/components/banner';
import { Button } from '@/components/button';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { requestPasswordReset } from '@/features/auth/auth-service';
import { color, space, type as typeTokens } from '@/design-system/tokens';

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit() {
    setServerError(null);
    setInfoMessage(null);

    if (!email.trim()) {
      setFieldError('Email is required');
      return;
    }
    setFieldError(null);

    setIsSubmitting(true);
    const result = await requestPasswordReset(email.trim());
    setIsSubmitting(false);

    if (!result.ok) {
      setServerError(result.message ?? 'Could not send reset email. Please try again.');
      return;
    }
    setInfoMessage('If an account exists for that email, a reset link has been sent.');
  }

  return (
    <AuthShell
      heroSource={require('../../../assets/images/studora-reset-password-hero.png')}
      variant="resetPassword"
      title="Reset password"
      subtitle="We'll send a reset link to your email."
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
          error={fieldError}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          icon="mail-outline"
          density="auth"
        />
      </View>

      <View style={styles.buttonWrap}>
        <Button label="Send Reset Link" onPress={handleSubmit} loading={isSubmitting} />
      </View>

      <Link href="/(auth)/sign-in" style={styles.link}>
        <ThemedText type="default" style={styles.linkText}>
          Back to Sign In
        </ThemedText>
      </Link>
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  bannerWrap: {
    marginBottom: space.md,
  },
  form: {
    gap: space.md,
  },
  buttonWrap: {
    marginTop: 20,
  },
  link: {
    alignSelf: 'center',
    paddingVertical: space.sm,
    marginTop: 12,
  },
  linkText: {
    color: color.primary.violet,
    fontSize: typeTokens.label.fontSize,
  },
});
