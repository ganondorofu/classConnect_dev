
"use client";

import React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Subject } from '@/models/subject';

const SUBJECT_SELECTOR_NONE_VALUE = "__SUBJECT_NONE__"; // Changed from ""

interface SubjectSelectorProps {
  subjects: Subject[];
  selectedSubjectId: string | null; 
  onValueChange: (subjectId: string | null) => void; 
  placeholder?: string; 
  disabled?: boolean;
  className?: string;
  id?: string;
  classId: string;
}

export function SubjectSelector({
  subjects,
  selectedSubjectId,
  onValueChange,
  placeholder = "科目を選択", 
  disabled = false,
  className,
  id,
}: SubjectSelectorProps) {

  const handleValueChange = (value: string) => {
    // A specific string value is used for "None", while null means "no change" or "use fixed".
    // The component consuming this will decide how to interpret null.
    onValueChange(value === SUBJECT_SELECTOR_NONE_VALUE ? "" : value);
  };
  
  // `selectedSubjectId` from the parent can be a subject ID, null, or ""
  // `null` means inherit from fixed. `""` means explicitly no subject.
  // The value of the Select component needs to be a string.
  const selectValue = selectedSubjectId === null ? undefined : (selectedSubjectId === "" ? SUBJECT_SELECTOR_NONE_VALUE : selectedSubjectId);

  return (
    <Select
      value={selectValue} 
      onValueChange={handleValueChange}
      disabled={disabled}
    >
      <SelectTrigger id={id} className={className}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={SUBJECT_SELECTOR_NONE_VALUE}>
          <span className="text-muted-foreground">科目なし</span>
        </SelectItem>
        {subjects.map((subject) => (
          <SelectItem key={subject.id} value={subject.id!}>
            {subject.name} {subject.teacherName ? `(${subject.teacherName})` : ''}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
