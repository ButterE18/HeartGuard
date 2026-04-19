import { StyleSheet } from 'react-native';

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#F5F7FA', // soft clinical gray-blue background
  },

  title: {
    fontSize: 30,
    fontWeight: '700',
    color: '#1B2A41', // deep medical navy
    letterSpacing: 0.5,
    marginBottom: 6,
  },

  subtitle: {
    fontSize: 15,
    color: '#5B6B7A',
    marginBottom: 18,
    lineHeight: 20,
  },

  stat: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2E7D32', // subtle medical green for "healthy/positive"
    marginBottom: 18,
  },

  card: {
    marginBottom: 14,
    backgroundColor: '#FFFFFF',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E6EAF0',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2, // Android soft depth
  },

  image: {
    height: 160,
    borderRadius: 10,
    marginBottom: 10,
    backgroundColor: '#EAEFF5',
  },

  bpm: {
    fontSize: 20,
    fontWeight: '700',
    color: '#D32F2F', // medical alert red for heart rate emphasis
    marginBottom: 4,
  },

  modal: {
    flex: 1,
    justifyContent: 'center',
    backgroundColor: 'rgba(10, 20, 30, 0.75)', // darker clinical overlay
    padding: 20,
  },

  modalContent: {
    backgroundColor: '#FFFFFF',
    padding: 20,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#DCE3EA',
  },

  modalImage: {
    height: 220,
    borderRadius: 10,
    marginBottom: 12,
    backgroundColor: '#EAEFF5',
  },

  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1B2A41',
    marginBottom: 10,
  },
});
