import { IsString, IsOptional, MinLength, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateCommentDto {
  @IsString()
  @MinLength(1, { message: 'publicationId ne peut pas être vide' })
  publicationId: string;

  @IsString()
  @MinLength(1,    { message: 'Le contenu ne peut pas être vide' })
  @MaxLength(5000, { message: 'Le contenu dépasse 5000 caractères' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  content: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  parentId?: string;
}