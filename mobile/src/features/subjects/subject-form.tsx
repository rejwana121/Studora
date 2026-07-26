import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Banner } from '@/components/banner';
import { Button } from '@/components/button';
import { ColorTokenPicker } from '@/components/color-token-picker';
import { TextField } from '@/components/text-field';
import { space } from '@/design-system/tokens';
import type { SubjectColorToken } from '@/types/api';

interface SubjectFormValues {
  name: string;
  color_token: SubjectColorToken;
}

interface SubjectFormProps {
  initialName?: string;
  initialColorToken?: SubjectColorToken;
  submitLabel: string;
  onSubmit: (values: SubjectFormValues) => Promise<string | null>;
  isSubmitting: boolean;
}

export function SubjectForm({
  initialName = '',
  initialColorToken,
  submitLabel,
  onSubmit,
  isSubmitting,
}: SubjectFormProps) {
  const [name, setName] = useState(initialName);
  const [colorToken, setColorToken] = useState<SubjectColorToken | null>(initialColorToken ?? null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [colorError, setColorError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  async function handleSubmit() {
    setServerError(null);
    const trimmedName = name.trim();
    const hasNameError = trimmedName.length === 0;
    const hasColorError = colorToken === null;
    setNameError(hasNameError ? 'Name is required' : null);
    setColorError(hasColorError ? 'Choose a colour' : null);
    if (hasNameError || hasColorError) return;

    const error = await onSubmit({ name: trimmedName, color_token: colorToken as SubjectColorToken });
    if (error) setServerError(error);
  }

  return (
    <View style={styles.form}>
      {serverError && <Banner variant="error" message={serverError} />}
      <TextField label="Name" value={name} onChangeText={setName} error={nameError} />
      <ColorTokenPicker label="Colour" value={colorToken} onChange={setColorToken} />
      {colorError && <Banner variant="error" message={colorError} />}
      <Button label={submitLabel} onPress={handleSubmit} loading={isSubmitting} />
    </View>
  );
}

const styles = StyleSheet.create({
  form: {
    gap: space.md,
  },
});
