import { useState } from 'react';

interface FormErrors {
  [key: string]: string;
}

interface ContractData {
  customerName: string;
  customerPhone: string;
  departurePoint: { address: string };
  destinationPoint: { address: string };
  departureDate: string;
  departureTime: string;
  passengerCount: number;
}

export function useFormValidation() {
  const [errors, setErrors] = useState<FormErrors>({});

  const validateContract = (data: ContractData): boolean => {
    const newErrors: FormErrors = {};

    if (!data.customerName.trim()) {
      newErrors.customerName = "Ім'я клієнта обов'язкове";
    }

    if (!data.customerPhone.trim()) {
      newErrors.customerPhone = "Телефон обов'язковий";
    } else if (!/^\+?[\d\s\-()]{10,}$/.test(data.customerPhone)) {
      newErrors.customerPhone = 'Невірний формат телефону';
    }

    if (!data.departurePoint.address.trim()) {
      newErrors.departurePoint = "Пункт відправлення обов'язковий";
    }

    if (!data.destinationPoint.address.trim()) {
      newErrors.destinationPoint = "Пункт призначення обов'язковий";
    }

    if (!data.departureDate) {
      newErrors.departureDate = "Дата відправлення обов'язкова";
    } else {
      const selectedDate = new Date(data.departureDate);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      if (selectedDate < today) {
        newErrors.departureDate = 'Дата не може бути в минулому';
      }
    }

    if (!data.departureTime) {
      newErrors.departureTime = "Час відправлення обов'язковий";
    }

    if (data.passengerCount < 1 || data.passengerCount > 50) {
      newErrors.passengerCount = 'Кількість пасажирів від 1 до 50';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const clearError = (field: string) => {
    setErrors((prev) => {
      const newErrors = { ...prev };
      delete newErrors[field];
      return newErrors;
    });
  };

  return {
    errors,
    validateContract,
    clearError,
    setErrors,
  };
}
