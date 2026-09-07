export interface AttributeSet {
  id: string;
  name: string;
}

export interface AttributeUse {
  attributeId: string;
  name: string;
  lineno: number;
}

export interface AttributeSetDetail {
  id: string;
  name: string;
  attributes: AttributeUse[];
}

export interface Attribute {
  id: string;
  name: string;
}

export interface AttributeValue {
  id: string;
  value: string;
  lineno: number;
}
