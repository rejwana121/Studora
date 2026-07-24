import { Link } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AuthShell } from '@/components/auth-shell';
import { Banner } from '@/components/banner';
import { BrandBadge } from '@/components/brand-badge';
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
    <AuthShell>
      <BrandBadge />
      <ThemedText type="default" style={styles.title}>
        Forgot Password
      </ThemedText>
      <ThemedText type="default" style={styles.subtitle}>
        Enter your email and we&apos;ll send a reset link via Supabase&apos;s default recovery
        flow.
      </ThemedText>

      {serverError && <Banner variant="error" message={serverError} />}
      {infoMessage && <Banner variant="success" message={infoMessage} />}

      <View style={styles.form}>
        <TextField
          label="Email"
          value={email}
          onChangeText={setEmail}
          error={fieldError}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
        />
      </View>

      <Button label="Send Reset Link" onPress={handleSubmit} loading={isSubmitting} />

      <Link href="/(auth)/sign-in" style={styles.link}>
        <ThemedText type="default" style={styles.linkText}>
          Back to Sign In
        </ThemedText>
      </Link>
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: typeTokens.display.fontSize,
    lineHeight: typeTokens.display.lineHeight,
    fontWeight: '700',
    color: color.text.primary,
    textAlign: 'center',
  },
  subtitle: {
    color: color.text.secondary,
    fontSize: typeTokens.body.fontSize,
    lineHeight: typeTokens.body.lineHeight,
    textAlign: 'center',
  },
  form: {
    gap: space.md,
  },
  link: {
    alignSelf: 'center',
    paddingVertical: space.sm,
  },
  linkText: {
    color: color.primary.violet,
    fontSize: typeTokens.label.fontSize,
  },
});
