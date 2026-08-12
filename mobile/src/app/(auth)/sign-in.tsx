import { Link, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AuthShell } from '@/components/auth-shell';
import { Banner } from '@/components/banner';
import { Button } from '@/components/button';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { signIn } from '@/features/auth/auth-service';
import { color, space, type as typeTokens } from '@/design-system/tokens';

export default function SignInScreen() {
  const { confirmed } = useLocalSearchParams<{ confirmed?: string }>();
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
    router.replace('/(app)/(tabs)');
  }

  return (
    <AuthShell
      heroSource={require('../../../assets/images/studora-sign-in-hero-opt.jpg')}
      variant="signIn"
      title="Welcome back"
      subtitle="Sign in to continue your study plan."
    >
      {serverError && (
        <View style={styles.bannerWrap}>
          <Banner variant="error" message={serverError} />
        </View>
      )}
      {!serverError && confirmed === '1' && (
        <View style={styles.bannerWrap}>
          <Banner variant="success" message="Email verified successfully. Please sign in." />
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
          autoComplete="password"
          icon="lock-closed-outline"
          showPasswordToggle
          density="auth"
        />
        <Link href="/(auth)/forgot-password" style={styles.forgotLink}>
          <ThemedText type="default" style={styles.forgotLinkText}>
            Forgot password?
          </ThemedText>
        </Link>
      </View>

      <View style={styles.buttonWrap}>
        <Button label="Sign In" onPress={handleSubmit} loading={isSubmitting} />
      </View>

      <Link href="/(auth)/sign-up" style={styles.link}>
        <ThemedText type="default" style={styles.linkText}>
          New here? Create an account
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
    gap: 14,
  },
  forgotLink: {
    alignSelf: 'flex-end',
  },
  forgotLinkText: {
    color: color.primary.violet,
    fontSize: typeTokens.label.fontSize,
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
