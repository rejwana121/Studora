import { Link, router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AuthShell } from '@/components/auth-shell';
import { Banner } from '@/components/banner';
import { BrandBadge } from '@/components/brand-badge';
import { Button } from '@/components/button';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { signIn } from '@/features/auth/auth-service';
import { color, space, type as typeTokens } from '@/design-system/tokens';

export default function SignInScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit() {
    setServerError(null);
    const errors: typeof fieldErrors = {};
    if (!email.trim()) errors.email = 'Email is required';
    if (!password) errors.password = 'Password is required';
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setIsSubmitting(true);
    const result = await signIn(email.trim(), password);
    setIsSubmitting(false);

    if (!result.ok) {
      setServerError(result.message ?? 'Sign in failed. Please try again.');
      return;
    }
    router.replace('/(app)');
  }

  return (
    <AuthShell>
      <BrandBadge />
      <ThemedText type="default" style={styles.title}>
        Sign In
      </ThemedText>
      <ThemedText type="default" style={styles.subtitle}>
        Welcome back—let&apos;s make today manageable.
      </ThemedText>

      {serverError && <Banner variant="error" message={serverError} />}

      <View style={styles.form}>
        <TextField
          label="Email"
          value={email}
          onChangeText={setEmail}
          error={fieldErrors.email}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
        />
        <TextField
          label="Password"
          value={password}
          onChangeText={setPassword}
          error={fieldErrors.password}
          secureTextEntry
          autoComplete="password"
        />
      </View>

      <Button label="Sign In" onPress={handleSubmit} loading={isSubmitting} />

      <Link href="/(auth)/forgot-password" style={styles.link}>
        <ThemedText type="default" style={styles.linkText}>
          Forgot password?
        </ThemedText>
      </Link>
      <Link href="/(auth)/sign-up" style={styles.link}>
        <ThemedText type="default" style={styles.linkText}>
          New here? Create an account
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
    fontSize: typeTokens.body.fontSize,
    lineHeight: typeTokens.body.lineHeight,
    color: color.text.secondary,
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
